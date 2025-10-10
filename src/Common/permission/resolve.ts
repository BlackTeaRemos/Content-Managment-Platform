import type { GuildMember } from 'discord.js';
import { log } from '../Log.js';
import { checkPermission } from './manager.js';
import type {
    PermissionDecision,
    PermissionToken,
    PermissionTokenInput,
    PermissionsObject,
    TokenSegmentInput,
} from './types.js';
import { formatPermissionToken, normalizeToken } from './tokens.js';

/**
 * Context available when resolving permission token templates.
 * @example
 * const context: TokenResolveContext = { commandName: 'create' };
 */
export interface TokenResolveContext {
    commandName?: string; // command identifier, example: 'create'
    options?: Record<string, any>; // flattened interaction options, example: { org: 'ORG1' }
    userId?: string; // Discord user id, example: '1234567890'
    guildId?: string; // Discord guild id, example: '0987654321'
    [key: string]: any;
}

/**
 * Replaces placeholder expressions within a template string using context values.
 * @param value string Template fragment containing optional placeholders (example: 'command:{commandName}').
 * @param context TokenResolveContext Context object searched for placeholder replacements (example: { commandName: 'create' }).
 * @returns string Interpolated string result (example: 'command:create').
 * @example
 * substitutePlaceholders('command:{commandName}', { commandName: 'create' });
 */
function substitutePlaceholders(value: string, context: TokenResolveContext): string {
    return value.replace(/\{([^}]+)\}/g, (_m, name) => {
        const valFromOptions =
            context.options && Object.prototype.hasOwnProperty.call(context.options, name)
                ? context.options[name]
                : undefined;
        const valFromCtx = Object.prototype.hasOwnProperty.call(context, name) ? context[name] : undefined;
        const val = valFromOptions ?? valFromCtx;
        if (val === undefined || val === null) return 'UNKNOWN';
        if (typeof val === 'object') {
            try {
                return String((val as any).toString?.() ?? JSON.stringify(val));
            } catch {
                return 'OBJECT';
            }
        }
        return String(val);
    });
}

/**
 * Resolves token templates into concrete tokens ordered from most specific to least specific.
 * @param template string | TokenSegmentInput[] Template string or array describing a permission token (example: 'command:{commandName}').
 * @param context TokenResolveContext Contextual data used for placeholder substitution (example: { commandName: 'create' }).
 * @returns PermissionToken[] Resolved tokens (example: [['command','create'],['command']]).
 * @example
 * resolve('command:{commandName}', { commandName: 'create' });
 */
function resolveTemplate(template: string | TokenSegmentInput[], context: TokenResolveContext): PermissionToken[] {
    if (!template || (Array.isArray(template) && template.length === 0)) {
        log.info(`Permission resolve: empty or invalid template: ${String(template)}`, 'Permission.resolve');
        return [];
    }

    const templates: (string | TokenSegmentInput[])[] = Array.isArray(template)
        ? [template]
        : template
              .split(',')
              .map(t => t.trim())
              .filter(Boolean);

    const results: PermissionToken[] = [];
    const seen = new Set<string>();

    for (const tmpl of templates) {
        if (Array.isArray(tmpl)) {
            const resolvedSegments = tmpl.map(part =>
                typeof part === 'string' ? substitutePlaceholders(part, context) : part,
            );
            const normalized = normalizeToken(resolvedSegments);
            if (!normalized.length) continue;
            for (let i = normalized.length; i >= 1; i--) {
                const candidate = normalized.slice(0, i) as PermissionToken;
                const key = formatPermissionToken(candidate);
                if (seen.has(key)) continue;
                seen.add(key);
                log.info(
                    `Permission resolve: resolved token [${formatPermissionToken(candidate)}] from array template`,
                    'Permission.resolve',
                );
                results.push(candidate);
            }
            continue;
        }

        log.info(`Permission resolve: expanding template: "${tmpl}"`, 'Permission.resolve');
        const resolved = substitutePlaceholders(tmpl, context);
        const parts = resolved
            .split(':')
            .map(p => p.trim())
            .filter(p => p !== '');
        const normalized = normalizeToken(parts);
        if (!normalized.length) continue;
        for (let i = normalized.length; i >= 1; i--) {
            const candidate = normalized.slice(0, i) as PermissionToken;
            const key = formatPermissionToken(candidate);
            if (seen.has(key)) continue;
            seen.add(key);
            log.info(
                `Permission resolve: adding fallback token: "${formatPermissionToken(candidate)}"`,
                'Permission.resolve',
            );
            results.push(candidate);
        }
    }

    return results;
}

/**
 * Payload provided to approval flow delegates when permissions require admin confirmation.
 * @property tokens PermissionToken[] Tokens that need approval (example: [['object','game','create']]).
 * @property reason string | undefined Optional explanation for request (example: 'Token(s) not defined').
 */
export interface ResolveApprovalPayload {
    tokens: PermissionToken[];
    reason?: string;
}

/**
 * Options passed to resolve.ensure for evaluating and approving permission tokens.
 * @property context TokenResolveContext Context used for template substitution (example: { serverId: '123' }).
 * @property permissions PermissionsObject Optional permission configuration map (example: { 'object:game:create': 'once' }).
 * @property member GuildMember | null Already-fetched Discord member when available (example: cached GuildMember).
 * @property getMember () => Promise<GuildMember | null> Lazy member fetcher when member not provided (example: () => guild.members.fetch()).
 * @property requestApproval (payload) => Promise<PermissionDecision | undefined> Delegate to request admin approval when required.
 * @property skipApproval boolean When true, skip admin approval flow and deny immediately.
 */
export interface ResolveEnsureOptions {
    context?: TokenResolveContext;
    permissions?: PermissionsObject;
    member?: GuildMember | null;
    getMember?: () => Promise<GuildMember | null>;
    requestApproval?: (payload: ResolveApprovalPayload) => Promise<PermissionDecision | undefined>;
    skipApproval?: boolean;
}

/**
 * Detailed outcome returned by resolve.ensure containing tokens, reasons, and decisions.
 * @property tokens PermissionToken[] Tokens evaluated during the process.
 * @property reason string | undefined Explanation when success is false.
 * @property decision PermissionDecision | undefined Admin decision when approval flow ran.
 */
export interface ResolveEnsureDetail {
    tokens: PermissionToken[];
    reason?: string;
    decision?: PermissionDecision;
}

/**
 * Result returned by resolve.ensure.
 * @property success boolean Indicates whether the permission check succeeded.
 * @property detail ResolveEnsureDetail Additional metadata about the evaluation result.
 */
export interface ResolveEnsureResult {
    success: boolean;
    detail: ResolveEnsureDetail;
}

function __collectEnsureTokens(
    templates: Array<string | TokenSegmentInput[]> = [],
    context: TokenResolveContext,
): PermissionToken[] {
    const tokens: PermissionToken[] = [];
    const seen = new Set<string>();
    for (const template of templates) {
        const resolved = resolveTemplate(template, context);
        for (const token of resolved) {
            const key = formatPermissionToken(token);
            if (seen.has(key)) continue;
            seen.add(key);
            tokens.push(token);
        }
    }
    return tokens;
}

function __toInputs(tokens: PermissionToken[]): PermissionTokenInput[] {
    return tokens.map(token => [...token]);
}

/**
 * Resolve permission templates and ensure the requester holds required permissions, requesting approval when needed.
 * @param templates Array<string | TokenSegmentInput[]> Templates describing permission tokens.
 * @param options ResolveEnsureOptions Additional parameters controlling evaluation and approval flow.
 * @returns Promise<ResolveEnsureResult> Structured permission evaluation result.
 * @example
 * const outcome = await resolve.ensure(['object:game:create:{serverId}'], { context: { serverId: '123' } });
 */
async function ensure(
    templates: Array<string | TokenSegmentInput[]>,
    options: ResolveEnsureOptions = {},
): Promise<ResolveEnsureResult> {
    try {
        const context = (options.context ?? {}) as TokenResolveContext;
        const tokens = __collectEnsureTokens(templates, context);

        if (tokens.length === 0) {
            return { success: true, detail: { tokens } };
        }

        let member: GuildMember | null | undefined = options.member;
        if (member === undefined && options.getMember) {
            member = await options.getMember();
        }

        const inputs = __toInputs(tokens);
        const evaluation = await checkPermission(options.permissions, member ?? null, inputs);

        if (evaluation.allowed) {
            return { success: true, detail: { tokens } };
        }

        if (!evaluation.requiresApproval || options.skipApproval || !options.requestApproval) {
            return {
                success: false,
                detail: { tokens, reason: evaluation.reason ?? 'Permission denied' },
            };
        }

        const decision = await options.requestApproval({ tokens, reason: evaluation.reason });

        if (decision === 'approve_once' || decision === 'approve_forever') {
            return { success: true, detail: { tokens, decision } };
        }

        return {
            success: false,
            detail: {
                tokens,
                decision,
                reason: evaluation.reason ?? 'Permission denied',
            },
        };
    } catch (error) {
        log.error(`resolve.ensure failed: ${String(error)}`, 'Permission.resolve.ensure');
        return {
            success: false,
            detail: {
                tokens: [],
                reason: `Permission resolution error: ${String(error)}`,
            },
        };
    }
}

type ResolveFn = {
    (template: string | TokenSegmentInput[], context: TokenResolveContext): PermissionToken[];
    ensure: (
        templates: Array<string | TokenSegmentInput[]>,
        options?: ResolveEnsureOptions,
    ) => Promise<ResolveEnsureResult>;
};

/**
 * Resolve function extended with ensure helper for approval-aware permission checks.
 */
export const resolve: ResolveFn = Object.assign(resolveTemplate, { ensure });
