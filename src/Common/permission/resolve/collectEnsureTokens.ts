import { formatPermissionToken } from '../tokens.js';
import { resolveTokens } from './resolveTokens.js';
import type { PermissionToken } from '../types.js';
import type { TokenResolveContext } from './types.js';

/**
 * Collects and deduplicates permission tokens from provided templates, resolving them against the given context.
 *
 * This function processes an array of permission templates, resolves each into tokens using the context,
 * and ensures no duplicate tokens are included in the result by tracking formatted token keys.
 *
 * @param templates - An array of permission templates, either as strings or arrays of TokenSegmentInput. Defaults to an empty array.
 *   Example: ['admin.view'], [['user', 'edit', 'profile']]
 * @param context - The resolution context containing variables and settings for token processing.
 *   Example: { guildId: '123', userId: '456' }
 * @returns An array of unique PermissionToken objects resolved from the templates.
 *   Example: [{ segments: ['admin', 'view'], variables: {} }, { segments: ['user', 'edit'], variables: { target: 'profile' } }]
 */
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
