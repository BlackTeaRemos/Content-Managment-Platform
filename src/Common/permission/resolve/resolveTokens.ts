import { log } from '../../Log.js';
import { formatPermissionToken, normalizeToken } from '../tokens.js';
import type { PermissionToken, TokenSegmentInput } from '../types.js';
import type { TokenResolveContext } from './types.js';

/**
 * Replace placeholders like `{name}` using values from context.
 */
function substitutePlaceholders(value: string, context: TokenResolveContext): string {
    return value.replace(/\{([^}]+)\}/g, (_m, name) => {
        const valFromOptions =
            context.options && Object.prototype.hasOwnProperty.call(context.options, name)
                ? context.options[name]
                : undefined;
        const valFromCtx = Object.prototype.hasOwnProperty.call(context, name) ? context[name] : undefined;
        const val = valFromOptions ?? valFromCtx;
        if (val === undefined || val === null) return 'UNKNOWN';
        if (typeof val === 'object') {
            try {
                return String((val as any).toString?.() ?? JSON.stringify(val));
            } catch {
                return 'OBJECT';
            }
        }
        return String(val);
    });
}

/**
 * Convert a template (string or array) into ordered tokens from most-specific to least-specific.
 */
export function resolveTokens(
    template: string | TokenSegmentInput[],
    context: TokenResolveContext = {},
): PermissionToken[] {
    if (!template || (Array.isArray(template) && template.length === 0)) {
        log.info(`Permission resolve: empty or invalid template: ${String(template)}`, 'Permission.resolve');
        return [];
    }

    const templates: (string | TokenSegmentInput[])[] = Array.isArray(template)
        ? [template]
        : String(template)
              .split(',')
              .map(t => t.trim())
              .filter(Boolean);

    const results: PermissionToken[] = [];
    const seen = new Set<string>();

    for (const tmpl of templates) {
        if (Array.isArray(tmpl)) {
            const resolvedSegments = tmpl.map(part =>
                typeof part === 'string' ? substitutePlaceholders(part, context) : part,
            );
            const normalized = normalizeToken(resolvedSegments);
            if (!normalized.length) continue;
            for (let i = normalized.length; i >= 1; i--) {
                const candidate = normalized.slice(0, i) as PermissionToken;
                const key = formatPermissionToken(candidate);
                if (seen.has(key)) continue;
                seen.add(key);
                log.info(
                    `Permission resolve: resolved token [${formatPermissionToken(candidate)}] from array template`,
                    'Permission.resolve',
                );
                results.push(candidate);
            }
            continue;
        }

        log.info(`Permission resolve: expanding template: "${tmpl}"`, 'Permission.resolve');
        const resolved = substitutePlaceholders(tmpl, context);
        const parts = resolved
            .split(':')
            .map(p => p.trim())
            .filter(p => p !== '');
        const normalized = normalizeToken(parts);
        if (!normalized.length) continue;
        for (let i = normalized.length; i >= 1; i--) {
            const candidate = normalized.slice(0, i) as PermissionToken;
            const key = formatPermissionToken(candidate);
            if (seen.has(key)) continue;
            seen.add(key);
            log.info(
                `Permission resolve: adding fallback token: "${formatPermissionToken(candidate)}"`,
                'Permission.resolve',
            );
            results.push(candidate);
        }
    }

    return results;
}
