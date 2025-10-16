import { log } from '../../Log.js';
import { checkPermission } from '../manager.js';
import type { PermissionToken, PermissionTokenInput } from '../types.js';
import type { ResolveEnsureOptions, ResolveEnsureResult } from './types.js';
import { collectEnsureTokens } from './collectEnsureTokens.js';
import { toInputs } from './toInputs.js';

/**
 * Public resolve function. Delegates to internal doEnsure implementation.
 * The function is explicitly named `resolve` to preserve a consistent symbol
 * name across the codebase.
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

        let member: import('discord.js').GuildMember | null | undefined = options.member;
        if (member === undefined && options.getMember) {
            member = await options.getMember();
        }

        const inputs: PermissionTokenInput[] = toInputs(tokens);
        const evaluation = await checkPermission(options.permissions, member ?? null, inputs);

        if (evaluation.allowed) {
            return { success: true, detail: { tokens, requiresApproval: !!evaluation.requiresApproval } };
        }

        if (!evaluation.requiresApproval || options.skipApproval || !options.requestApproval) {
            return {
                success: false,
                detail: {
                    tokens,
                    reason: evaluation.reason ?? `Permission denied`,
                    requiresApproval: !!evaluation.requiresApproval,
                },
            };
        }

        const decision = await options.requestApproval({ tokens, reason: evaluation.reason } as any);

        if (decision === `approve_once` || decision === `approve_forever`) {
            return { success: true, detail: { tokens, decision } };
        }

        return {
            success: false,
            detail: {
                tokens,
                decision,
                reason: evaluation.reason ?? `Permission denied`,
            },
        };
    } catch(error) {
        log.error(`doEnsure failed: ${String(error)}`, `Permission.doEnsure`);
        return {
            success: false,
            detail: {
                tokens: [],
                reason: `Permission resolution error: ${String(error)}`,
            },
        };
    }
}
