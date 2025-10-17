import type { PermissionToken, PermissionTokenInput, TokenSegmentInput } from './types.js';
import { normalizeSegment } from './normalizeSegment.js';

/**
 * Converts various token representations into a standard array-based token.
 *
 * This function normalizes string tokens by splitting on ':' and array tokens by processing each segment,
 * ensuring consistent PermissionToken format for further processing.
 *
 * @param token - The token input to normalize, either a string or array of segments.
 *   Example: 'command:create' or ['command', 'create']
 * @returns A normalized PermissionToken array with processed segments.
 *   Example: ['command', 'create']
 */
export function normalizeToken(token: PermissionTokenInput): PermissionToken {
    if (Array.isArray(token)) {
        return token.map(segment => {
            return normalizeSegment(segment);
        }) as PermissionToken;
    }
    if (typeof token === `string`) {
        const trimmed = token.trim();
        if (!trimmed) {
            return [];
        }
        return trimmed.split(`:`).map(part => {
            return normalizeSegment(part);
        }) as PermissionToken;
    }
    return [];
}
