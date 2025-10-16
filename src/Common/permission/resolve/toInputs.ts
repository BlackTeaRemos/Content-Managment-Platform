import type { PermissionToken, PermissionTokenInput } from '../types.js';

export function toInputs(tokens: PermissionToken[]): PermissionTokenInput[] {
    return tokens.map(token => {
        return [...token];
    });
}
