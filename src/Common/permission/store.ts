import { tokenKey, normalizeToken } from './tokens.js';
import type { PermissionTokenInput } from './types.js';

const grantedForever: Map<string, Map<string, Set<string>>> = new Map(); // guildId -> userId -> serialized tokens

/**
 * Persist a permanent permission grant in memory for the prototype.
 * @param guildId string Unique guild identifier (example: 'guild').
 * @param userId string Unique user identifier (example: 'user').
 * @param token PermissionTokenInput Token granted forever (example: 'command:create').
 * @returns void Performs side effects only (example: stores serialized token).
 * @example
 * grantForever('guild', 'user', 'command:create');
 */
export function grantForever(guildId: string, userId: string, token: PermissionTokenInput): void {
    if (!guildId || !userId) {
        return;
    }

    const normalized = normalizeToken(token);
    if (!normalized.length) {
        return;
    }

    const serialized = tokenKey(normalized);
    if (!grantedForever.has(guildId)) {
        grantedForever.set(guildId, new Map());
    }

    const guildMap = grantedForever.get(guildId)!;
    if (!guildMap.has(userId)) {
        guildMap.set(userId, new Set());
    }

    guildMap.get(userId)!.add(serialized);
}

/**
 * Checks whether a user already holds a permanent grant for any provided token.
 * @param guildId string Guild identifier (example: 'guild').
 * @param userId string User identifier (example: 'user').
 * @param tokens PermissionTokenInput[] Tokens to compare against stored grants (example: ['command:create']).
 * @returns boolean True when a matching permanent grant is found (example: true).
 * @example
 * const allowed = hasPermanentGrant('guild', 'user', ['command:create']);
 */
export function hasPermanentGrant(
    guildId: string | undefined,
    userId: string | undefined,
    tokens: PermissionTokenInput[],
): boolean {
    if (!guildId || !userId) {
        return false;
    }

    const guildMap = grantedForever.get(guildId);
    if (!guildMap) {
        return false;
    }

    const userTokens = guildMap.get(userId);
    if (!userTokens) {
        return false;
    }

    for (const token of tokens) {
        const normalized = normalizeToken(token);
        if (!normalized.length) {
            continue;
        }

        const serialized = tokenKey(normalized);
        if (userTokens.has(serialized)) {
            return true;
        }
    }
    return false;
}
