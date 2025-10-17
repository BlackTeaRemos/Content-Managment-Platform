import type { PermissionToken } from './types.js';

/**
 * Generates a canonical string representation for a token.
 *
 * This function serializes a PermissionToken into a unique string key, prefixing types for accurate comparison
 * in sets and maps, handling undefined, numbers, booleans, and strings.
 *
 * @param token - The PermissionToken to serialize.
 *   Example: ['command', 'create']
 * @returns A unique string identifier for the token.
 *   Example: 's:command|s:create'
 */
export function tokenKey(token: PermissionToken): string {
    return token
        .map(part => {
            if (part === undefined) {
                return `u:`;
            }
            if (typeof part === `number`) {
                return `n:${part}`;
            }
            if (typeof part === `boolean`) {
                return `b:${part ? `1` : `0`}`;
            }
            return `s:${part}`;
        })
        .join(`|`);
}
