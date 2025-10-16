import type { PermissionToken, PermissionTokenInput, TokenSegmentInput } from './types.js';
import { normalizeSegment } from './normalizeSegment.js';

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
