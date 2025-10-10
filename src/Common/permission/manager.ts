import type { GuildMember } from 'discord.js';
import { buildPermissionEmitter, evaluateToken } from './emitter.js';
import { hasPermanentGrant } from './store.js';
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
    if (state === 'allowed') {
        return { allowed: true };
    }
    if (state === 'once') {
        return {
            allowed: false,
            requiresApproval: true,
            missing: [formattedToken],
            reason: 'Requires one-time approval',
        };
    }
    if (state === 'forbidden') {
        return {
            allowed: false,
            requiresApproval: false,
            missing: [formattedToken],
            reason: 'Explicitly forbidden',
        };
    }
    return { allowed: false, requiresApproval: true, missing: [formattedToken], reason: 'Token(s) not defined' };
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
        if (member && member.permissions?.has && member.permissions.has('Administrator')) {
            return { allowed: true };
        }

        const guildId = member?.guild.id;
        const userId = member?.id;

        if (hasPermanentGrant(guildId, userId, tokens)) {
            return { allowed: true };
        }

        if (!permissions || Object.keys(permissions).length === 0) {
            return { allowed: false, requiresApproval: true, reason: 'No explicit permissions configured' };
        }

        const emitter = buildPermissionEmitter(permissions);
        const missing: string[] = []; // list of tokens requiring approval

        for (const tokenInput of tokens) {
            const token = normalizeToken(tokenInput);
            if (!token.length) continue;
            const formatted = formatPermissionToken(token);
            const state = evaluateToken(emitter, token);
            if (!state || state === 'undefined') {
                missing.push(formatted);
                continue;
            }
            const result = computeStateResult(state, formatted);
            if (result.allowed) {
                return result;
            }
            if (state === 'once' || state === 'forbidden') {
                return result;
            }
        }

        return {
            allowed: false,
            requiresApproval: true,
            missing: missing.length ? missing : undefined,
            reason: missing.length ? 'Token(s) not defined' : undefined,
        };
    } catch (err: any) {
        return { allowed: false, reason: `Permission check error: ${String(err)}` };
    }
}
