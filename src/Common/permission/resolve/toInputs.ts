import type { PermissionToken, PermissionTokenInput } from '../types.js';

/**
 * Converts an array of PermissionTokens back into PermissionTokenInput format.
 *
 * This function creates shallow copies of each token array to ensure immutability when converting
 * resolved tokens back to input format for further processing.
 *
 * @param tokens - An array of PermissionTokens to convert.
 *   Example: [['command', 'create'], ['admin', 'view']]
 * @returns An array of PermissionTokenInput arrays.
 *   Example: [['command', 'create'], ['admin', 'view']]
 */
export function toInputs(tokens: PermissionToken[]): PermissionTokenInput[] {
    return tokens.map(token => {
        return [...token];
    });
}
