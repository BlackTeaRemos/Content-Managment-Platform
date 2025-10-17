import type { PermissionToken } from './types.js';

/**
 * Formats a token for human-readable output.
 *
 * This function converts a PermissionToken array into a colon-separated string, replacing undefined segments with '*'
 * for display purposes.
 *
 * @param token - The PermissionToken to format.
 *   Example: ['command', 'create']
 * @returns A formatted string representation using colon separators.
 *   Example: 'command:create'
 */
export function formatPermissionToken(token: PermissionToken): string {
    if (!token.length) {
        return `EMPTY`;
    }
    return token
        .map(part => {
            if (part === undefined) {
                return `*`;
            }
            return String(part);
        })
        .join(`:`);
}
