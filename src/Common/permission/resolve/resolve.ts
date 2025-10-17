import { GuildMember } from 'discord.js';
import { log } from '../../Log.js';
import { checkPermission } from '../manager.js';
import type { PermissionToken, PermissionTokenInput, TokenSegmentInput } from '../types.js';
import { collectEnsureTokens } from './collectEnsureTokens.js';
import { toInputs } from './toInputs.js';
import type { ResolveEnsureOptions, ResolveEnsureResult, TokenResolveContext } from './types.js';

/**
 * Public resolve function. Delegates to internal doEnsure implementation.
 * The function is explicitly named `resolve` to preserve a consistent symbol
 * name across the codebase.
 */
export async function resolve(
    templates: Array<string | TokenSegmentInput[]>,
    options: ResolveEnsureOptions = {},
): Promise<ResolveEnsureResult> {
    try {
        const context = (options.context ?? {}) as TokenResolveContext;
        const tokens = collectEnsureTokens(templates, context);

        log.debug(
            `resolve invoked templates=${templates.length} tokens=${
                tokens.length ? tokens.map(token => token.map(segment => segment ?? ``).join(`:`)).join(`, `) : `none`
            }`,
            `Permission.resolve`,
        );

        if (tokens.length === 0) {
            return { success: true, detail: { tokens } };
        }

        let member: GuildMember | null | undefined = options.member;
        if (member === undefined && options.getMember) {
            member = await options.getMember();
        }

        const inputs: PermissionTokenInput[] = toInputs(tokens);
        const evaluation = await checkPermission(options.permissions, member ?? null, inputs);

        log.debug(
            `resolve evaluation allowed=${evaluation.allowed} requiresApproval=${
                evaluation.requiresApproval ?? false
            } reason=${evaluation.reason ?? `none`}`,
            `Permission.resolve`,
        );

        if (evaluation.allowed) {
            log.debug(`resolve returning success without approval`, `Permission.resolve`);
            return { success: true, detail: { tokens, requiresApproval: !!evaluation.requiresApproval } };
        }

        log.debug(
            `resolve approval check: requiresApproval=${evaluation.requiresApproval} skipApproval=${options.skipApproval} hasCallback=${!!options.requestApproval}`,
            `Permission.resolve`,
        );

        if (!evaluation.requiresApproval || options.skipApproval || !options.requestApproval) {
            log.debug(`resolve returning failure without approval request`, `Permission.resolve`);
            return {
                success: false,
                detail: {
                    tokens,
                    reason: evaluation.reason ?? `Permission denied`,
                    requiresApproval: !!evaluation.requiresApproval,
                },
            };
        }

        log.debug(`resolve invoking requestApproval callback`, `Permission.resolve`);
        const decision = await options.requestApproval({ tokens, reason: evaluation.reason } as any);

        log.debug(`resolve requestApproval decision=${decision ?? `none`}`, `Permission.resolve`);

        if (decision === `approve_once` || decision === `approve_forever`) {
            log.debug(`resolve returning success decision=${decision}`, `Permission.resolve`);
            return { success: true, detail: { tokens, decision } };
        }

        log.debug(`resolve returning failure post approval`, `Permission.resolve`);
        return {
            success: false,
            detail: {
                tokens,
                decision,
                reason: evaluation.reason ?? `Permission denied`,
                requiresApproval: true,
            },
        };
    } catch (error) {
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
