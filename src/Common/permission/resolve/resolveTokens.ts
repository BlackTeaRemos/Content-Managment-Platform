import { log } from '../../Log.js';
import { formatPermissionToken, normalizeToken } from '../tokens.js';
import type { PermissionToken, TokenSegmentInput } from '../types.js';
import type { TokenResolveContext } from './types.js';

/**
 * Substitutes placeholders in a string value using values from the provided context.
 *
 * This function replaces patterns like `{name}` with corresponding values from the context object,
 * handling nested properties, objects, and providing fallbacks for undefined values.
 *
 * @param value - The string containing placeholders to substitute.
 *   Example: 'user:{userId}:edit:{action}'
 * @param context - The resolution context containing variables for substitution.
 *   Example: { userId: '123', action: 'profile' }
 * @returns The string with placeholders replaced by context values.
 *   Example: 'user:123:edit:profile' (assuming context has userId='123' and action='profile')
 */
function substitutePlaceholders(value: string, context: TokenResolveContext): string {
    return value.replace(/\{([^}]+)\}/g, (_m, name) => {
        const valFromOptions =
            context.options && Object.prototype.hasOwnProperty.call(context.options, name)
                ? context.options[name]
                : undefined;
        const valFromCtx = Object.prototype.hasOwnProperty.call(context, name) ? context[name] : undefined;
        const val = valFromOptions ?? valFromCtx;
        if (val === undefined || val === null) {
            return `UNKNOWN`;
        }
        if (typeof val === `object`) {
            try {
                return String((val as any).toString?.() ?? JSON.stringify(val));
            } catch {
                return `OBJECT`;
            }
        }
        return String(val);
    });
}

/**
 * Converts a permission template (string or array) into an ordered array of permission tokens, from most-specific to least-specific.
 *
 * This function processes the template by substituting placeholders with context values, normalizing segments,
 * and generating hierarchical tokens to allow for fallback permission checks. It handles both string templates
 * (split by ':' and ',') and array templates, ensuring unique tokens and logging resolution steps.
 *
 * @param template - The permission template to resolve, either a string (e.g., 'user:{id}:edit') or an array of TokenSegmentInput.
 *   Example: 'admin:view:profile' or [['user', '{userId}', 'edit']]
 * @param context - The resolution context containing variables for placeholder substitution. Defaults to an empty object.
 *   Example: { userId: '123', guildId: '456' }
 * @returns An array of unique PermissionToken objects, ordered from most-specific to least-specific.
 *   Example: [{ segments: ['admin', 'view', 'profile'], variables: {} }, { segments: ['admin', 'view'], variables: {} }, { segments: ['admin'], variables: {} }]
 */
export function resolveTokens(
    template: string | TokenSegmentInput[],
    context: TokenResolveContext = {},
): PermissionToken[] {
    if (!template || (Array.isArray(template) && template.length === 0)) {
        log.info(`Permission resolve: empty or invalid template: ${String(template)}`, `Permission.resolve`);
        return [];
    }

    const templates: (string | TokenSegmentInput[])[] = Array.isArray(template)
        ? [template]
        : String(template)
              .split(`,`)
              .map(t => {
                  return t.trim();
              })
              .filter(Boolean);

    const results: PermissionToken[] = [];
    const seen = new Set<string>();

    for (const tmpl of templates) {
        if (Array.isArray(tmpl)) {
            const resolvedSegments = tmpl.map(part => {
                return typeof part === `string` ? substitutePlaceholders(part, context) : part;
            });
            const normalized = normalizeToken(resolvedSegments);
            if (!normalized.length) {
                continue;
            }
            for (let i = normalized.length; i >= 1; i--) {
                const candidate = normalized.slice(0, i) as PermissionToken;
                const key = formatPermissionToken(candidate);
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                results.push(candidate);
            }
            continue;
        }

        const resolved = substitutePlaceholders(tmpl, context);
        const parts = resolved
            .split(`:`)
            .map(p => {
                return p.trim();
            })
            .filter(p => {
                return p !== ``;
            });

        const normalized = normalizeToken(parts);
        if (!normalized.length) {
            continue;
        }
        for (let i = normalized.length; i >= 1; i--) {
            const candidate = normalized.slice(0, i) as PermissionToken;
            const key = formatPermissionToken(candidate);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            log.info(
                `Permission resolve: adding fallback token: "${formatPermissionToken(candidate)}"`,
                `Permission.resolve`,
            );
            results.push(candidate);
        }
    }

    return results;
}
