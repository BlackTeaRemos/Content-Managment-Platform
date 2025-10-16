import type { PermissionToken } from './types.js';

export function tokenKey(token: PermissionToken): string {
    return token
        .map(part => {
            if (part === undefined) return 'u:';
            if (typeof part === 'number') return `n:${part}`;
            if (typeof part === 'boolean') return `b:${part ? '1' : '0'}`;
            return `s:${part}`;
        })
        .join('|');
}
