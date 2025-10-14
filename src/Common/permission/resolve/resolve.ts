import { log } from '../../Log.js';
import { checkPermission } from '../manager.js';
import { formatPermissionToken } from '../tokens.js';
import { resolveTokens } from './resolveTokens.js';
import type { PermissionToken, PermissionTokenInput } from '../types.js';
import type { ResolveEnsureOptions, ResolveEnsureResult, ResolveApprovalPayload } from './types.js';

function collectEnsureTokens(
    templates: Array<string | import('../types.js').TokenSegmentInput[]> = [],
    context: import('./types.js').TokenResolveContext,
): PermissionToken[] {
    const tokens: PermissionToken[] = [];
    const seen = new Set<string>();
    for (const template of templates) {
        const resolved = resolveTokens(template, context);
        for (const token of resolved) {
            const key = formatPermissionToken(token);
            if (seen.has(key)) continue;
            seen.add(key);
            tokens.push(token);
        }
    }
    return tokens;
}

function toInputs(tokens: PermissionToken[]): PermissionTokenInput[] {
    return tokens.map(token => [...token]);
}

/**
 * Approval-aware permission evaluation. Returns a structured result indicating
 * whether the requested templates are allowed, and any admin decision if required.
 */
export async function resolve(
    templates: Array<string | import('../types.js').TokenSegmentInput[]>,
    options: ResolveEnsureOptions = {},
): Promise<ResolveEnsureResult> {
    try {
        const context = (options.context ?? {}) as import('./types.js').TokenResolveContext;
        const tokens = collectEnsureTokens(templates, context);

        if (tokens.length === 0) {
            return { success: true, detail: { tokens } };
        }

        let member = options.member;
        if (member === undefined && options.getMember) {
            member = await options.getMember();
        }

        const inputs = toInputs(tokens);
        const evaluation = await checkPermission(options.permissions, member ?? null, inputs);

        if (evaluation.allowed) {
            return { success: true, detail: { tokens, requiresApproval: !!evaluation.requiresApproval } };
        }

        if (!evaluation.requiresApproval || options.skipApproval || !options.requestApproval) {
            return {
                success: false,
                detail: {
                    tokens,
                    reason: evaluation.reason ?? 'Permission denied',
                    requiresApproval: !!evaluation.requiresApproval,
                },
            };
        }

        const decision = await options.requestApproval({ tokens, reason: evaluation.reason } as ResolveApprovalPayload);

        if (decision === 'approve_once' || decision === 'approve_forever') {
            return { success: true, detail: { tokens, decision } };
        }

        return {
            success: false,
            detail: {
                tokens,
                decision,
                reason: evaluation.reason ?? 'Permission denied',
            },
        };
    } catch (error) {
        log.error(`ensure failed: ${String(error)}`, 'Permission.ensure');
        return {
            success: false,
            detail: {
                tokens: [],
                reason: `Permission resolution error: ${String(error)}`,
            },
        };
    }
}
