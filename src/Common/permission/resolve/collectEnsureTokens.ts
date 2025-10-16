import { formatPermissionToken } from '../tokens.js';
import { resolveTokens } from './resolveTokens.js';
import type { PermissionToken } from '../types.js';
import type { TokenResolveContext } from './types.js';

export function collectEnsureTokens(
    templates: Array<string | import('../types.js').TokenSegmentInput[]> = [],
    context: TokenResolveContext,
): PermissionToken[] {
    const tokens: PermissionToken[] = [];
    const seen = new Set<string>();
    for (const template of templates) {
        const resolved = resolveTokens(template, context);
        for (const token of resolved) {
            const key = formatPermissionToken(token);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            tokens.push(token);
        }
    }
    return tokens;
}
