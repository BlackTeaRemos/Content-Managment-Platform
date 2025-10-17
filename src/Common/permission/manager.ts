import type { GuildMember } from 'discord.js';
import { log } from '../Log.js';
import { buildPermissionEmitter, evaluateToken } from './emitter.js';
import { formatPermissionToken, normalizeToken } from './tokens.js';
import type { PermissionCheckResult, PermissionState, PermissionTokenInput, PermissionsObject } from './types.js';

/**
 * Translates a permission state into a standardized permission check result.
 * @param state PermissionState Evaluated permission state (example: 'once').
 * @param formattedToken string Token presented to humans (example: 'command:create').
 * @returns PermissionCheckResult Result object matching the state (example: { allowed: false, requiresApproval: true }).
 * @example
 * const result = computeStateResult('allowed', 'command:create');
 */
function computeStateResult(state: PermissionState, formattedToken: string): PermissionCheckResult {
    // if (state === `allowed`) {
    //     return { allowed: true };
    // }
    if (state === `once`) {
        return {
            allowed: false,
            requiresApproval: true,
            missing: [formattedToken],
            reason: `Requires one-time approval`,
        };
    }
    if (state === `forbidden`) {
        return {
            allowed: false,
            requiresApproval: false,
            missing: [formattedToken],
            reason: `Explicitly forbidden`,
        };
    }
    return { allowed: false, requiresApproval: true, missing: [formattedToken], reason: `Token(s) not defined` };
}

/**
 * Evaluates whether a guild member holds permissions for provided tokens.
 * @param permissions PermissionsObject | undefined Permission configuration object, optional (example: { 'command:create': 'allowed' }).
 * @param member GuildMember | null Discord member requesting the action (example: fetched GuildMember instance).
 * @param tokens PermissionTokenInput[] Candidate tokens to evaluate (example: ['command:create']).
 * @returns Promise<PermissionCheckResult> Permission check outcome (example: { allowed: true }).
 * @example
 * const result = await checkPermission(config.permissions, member, ['command:create']);
 */
export async function checkPermission(
    permissions: PermissionsObject | undefined,
    member: GuildMember | null,
    tokens: PermissionTokenInput[],
): Promise<PermissionCheckResult> {
    try {
        const guildId = member?.guild.id;
        const userId = member?.id;

        const tokenSummaries = tokens
            .map(tokenInput => {
                const normalized = normalizeToken(tokenInput);
                return normalized.length ? formatPermissionToken(normalized) : ``;
            })
            .filter(Boolean);

        log.debug(
            `checkPermission invoked guild=${guildId ?? `unknown`} user=${userId ?? `unknown`} tokens=${
                tokenSummaries.length ? tokenSummaries.join(`, `) : `none`
            }`,
            `Permission.checkPermission`,
        );

        // Permanent in-memory grants bypass database-backed permission checks, so disable
        // the shortcut until durable storage exists.
        // if (hasPermanentGrant(guildId, userId, tokens)) {
        //     return { allowed: true };
        // }

        if (!permissions || Object.keys(permissions).length === 0) {
            const outcome = { allowed: false, requiresApproval: true, reason: `No explicit permissions configured` };
            log.debug(`No permissions configured; requiring approval`, `Permission.checkPermission`);
            return outcome;
        }

        const emitter = buildPermissionEmitter(permissions);
        const missing: string[] = []; // list of tokens requiring approval

        for (const tokenInput of tokens) {
            const token = normalizeToken(tokenInput);
            if (!token.length) {
                continue;
            }
            const formatted = formatPermissionToken(token);
            const state = evaluateToken(emitter, token);
            if (!state || state === `undefined`) {
                missing.push(formatted);
                continue;
            }
            const result = computeStateResult(state, formatted);
            if (result.allowed) {
                log.debug(`Token ${formatted} returned allowed`, `Permission.checkPermission`);
                return result;
            }
            if (state === `once` || state === `forbidden`) {
                log.debug(`Token ${formatted} returned state=${state}`, `Permission.checkPermission`);
                return result;
            }
        }

        const fallback = {
            allowed: false,
            requiresApproval: true,
            missing: missing.length ? missing : undefined,
            reason: missing.length ? `Token(s) not defined` : undefined,
        };
        log.debug(
            `Defaulting to approval required; missing=${missing.join(`, `) || `none`}`,
            `Permission.checkPermission`,
        );
        return fallback;
    } catch (err: any) {
        log.error(`Permission check error: ${String(err)}`, `Permission.checkPermission`);
        return { allowed: false, reason: `Permission check error: ${String(err)}` };
    }
}
