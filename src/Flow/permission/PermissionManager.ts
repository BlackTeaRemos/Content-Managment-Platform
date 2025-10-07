import { GuildMember } from 'discord.js';
import { log } from '../../Common/Log.js';

/**
 * Permission states used in the simple permission object model.
 */
export type PermissionState = 'undefined' | 'forbidden' | 'once' | 'allowed';

/**
 * A minimal permissions object. Keys are permission tokens (for example a command id or tag).
 * Values are PermissionState describing default behaviour.
 */
export type PermissionsObject = Record<string, PermissionState>;

/**
 * Result returned from a permission check.
 */
export interface PermissionCheckResult {
    allowed: boolean; // whether execution is allowed immediately
    reason?: string; // human-friendly reason why not allowed
    missing?: string[]; // list of tokens that would be required
    requiresApproval?: boolean; // whether UI approval flow should be started
}

// In-memory store for permanently granted permissions: guildId -> userId -> set of tokens
const _grantedForever: Map<string, Map<string, Set<string>>> = new Map();

/**
 * Grant a permission permanently for a given user in a guild.
 * This is only an in-memory shortcut for the prototype; a real implementation should persist it.
 */
export function grantForever(guildId: string, userId: string, token: string) {
    if (!guildId || !userId || !token) return;
    if (!_grantedForever.has(guildId)) _grantedForever.set(guildId, new Map());
    const guildMap = _grantedForever.get(guildId)!;
    if (!guildMap.has(userId)) guildMap.set(userId, new Set());
    guildMap.get(userId)!.add(token);
}

/**
 * Check whether a user is allowed to execute an action identified by tokens (command name and tags).
 * Evaluation order (simple prototype):
 *  - If user has Administrator permission in guild -> allowed
 *  - If grantedForever contains a matching token -> allowed
 *  - If permissionsObj explicitly allows the token -> allowed
 *  - If permissionsObj explicitly forbids the token -> denied
 *  - Otherwise: requires admin approval
 */
export async function checkPermission(
    permissionsObj: PermissionsObject | undefined,
    member: GuildMember | null,
    tokens: string[],
): Promise<PermissionCheckResult> {
    try {
        // Admins can always run commands
        if (member && member.permissions?.has && member.permissions.has('Administrator')) {
            return { allowed: true };
        }

        const guildId = member?.guild.id;
        const userId = member?.id;

        // Check grantedForever store
        if (guildId && userId) {
            const gm = _grantedForever.get(guildId);
            if (gm) {
                const set = gm.get(userId);
                if (set) {
                    for (const t of tokens) {
                        if (set.has(t)) return { allowed: true };
                    }
                }
            }
        }

        // If there is no permissions object at all, require approval by default
        if (!permissionsObj || Object.keys(permissionsObj).length === 0) {
            return { allowed: false, requiresApproval: true, reason: 'No explicit permissions configured' };
        }

        const missing: string[] = [];

        for (const t of tokens) {
            const state = permissionsObj[t];
            if (!state || state === 'undefined') {
                missing.push(t);
                continue;
            }
            if (state === 'allowed') return { allowed: true };
            if (state === 'once')
                return { allowed: false, requiresApproval: true, missing: [t], reason: 'Requires one-time approval' };
            if (state === 'forbidden')
                return { allowed: false, requiresApproval: false, missing: [t], reason: 'Explicitly forbidden' };
        }

        // No explicit allow found but some tokens missing -> require approval
        return {
            allowed: false,
            requiresApproval: true,
            missing: missing.length ? missing : undefined,
            reason: 'Token(s) not defined',
        };
    } catch (err: any) {
        return { allowed: false, reason: `Permission check error: ${String(err)}` };
    }
}

/**
 * Context passed to token resolver. Typically includes data from the command interaction.
 */
export interface TokenResolveContext {
    commandName?: string; // 'create', 'remove', etc.
    options?: Record<string, any>; // command options by name
    userId?: string;
    guildId?: string;
    // allow arbitrary extra fields (for future extension)
    [key: string]: any;
}

/**
 * Resolve a permission token template against provided context.
 * Supports placeholders in the form {name} which are first looked up in options, then top-level context keys.
 * Produces a list of hierarchical tokens (most specific first), for example:
 *  template = 'command:{commandName}:{orgUid}' with context.commandName='create', context.options.orgUid='ORG1'
 *  returns: [ 'command:create:ORG1', 'command:create', 'command' ]
 *
 * This lets permission checks try exact tokens first and fall back to more general tokens.
 *
 * @param template Permission token template or comma-separated list of templates
 * @param context TokenResolveContext containing values used to expand placeholders
 * @returns string[] Resolved tokens, ordered from most-specific to most-general
 */
export function resolve(template: string, context: TokenResolveContext): string[] {
    if (!template || typeof template !== 'string') {
        log.info(`Permission resolve: empty or invalid template: ${template}`, 'PermissionManager.resolve');
        return [];
    }
    log.info(
        `Permission resolve: templates input="${template}" context=${JSON.stringify(context)}`,
        'PermissionManager.resolve',
    );

    // Support comma-separated templates
    const templates = template
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
    const results: string[] = [];

    for (const t of templates) {
        log.info(`Permission resolve: expanding template: "${t}"`, 'PermissionManager.resolve');
        // Replace placeholders {name} with context.options[name] or context[name] or 'UNKNOWN'
        const resolved = t.replace(/\{([^}]+)\}/g, (_m, name) => {
            // check options first
            const valFromOptions =
                context.options && Object.prototype.hasOwnProperty.call(context.options, name)
                    ? context.options[name]
                    : undefined;
            const valFromCtx = Object.prototype.hasOwnProperty.call(context, name) ? context[name] : undefined;
            const val = valFromOptions ?? valFromCtx;
            if (val === undefined || val === null) return 'UNKNOWN';
            // convert objects to JSON-literal short form
            if (typeof val === 'object') {
                try {
                    return String((val as any).toString?.() ?? JSON.stringify(val));
                } catch {
                    return 'OBJECT';
                }
            }
            return String(val);
        });

        log.info(`Permission resolve: intermediate resolved string: "${resolved}"`, 'PermissionManager.resolve');
        // Create hierarchical fallbacks based on ':' separator
        const parts = resolved.split(':').filter(p => p !== '');
        for (let i = parts.length; i >= 1; i--) {
            const token = parts.slice(0, i).join(':');
            if (token && !results.includes(token)) {
                log.info(`Permission resolve: adding fallback token: "${token}"`, 'PermissionManager.resolve');
                results.push(token);
            }
        }
        // If resolved was empty or had no parts, include the resolved string itself
        if (parts.length === 0 && resolved && !results.includes(resolved)) results.push(resolved);
    }

    return results;
}
