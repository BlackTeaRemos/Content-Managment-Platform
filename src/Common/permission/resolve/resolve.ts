import { GuildMember } from 'discord.js';
import { log } from '../../Log.js';
import { checkPermission } from '../manager.js';
import type { PermissionToken, PermissionTokenInput, TokenSegmentInput } from '../types.js';
import { collectEnsureTokens } from './collectEnsureTokens.js';
import { toInputs } from './toInputs.js';
import type { ResolveEnsureOptions, ResolveEnsureResult, TokenResolveContext } from './types.js';

/**
 * Resolves permission tokens based on provided templates and options, evaluating access rights and handling approval workflows if necessary.
 *
 * This function processes permission templates, collects relevant tokens, checks permissions against a member or context,
 * and manages approval requests for denied permissions when applicable. It delegates to internal implementations for token collection and evaluation.
 *
 * The function is explicitly named `resolve` to preserve a consistent symbol name across the codebase.
 *
 * @param templates - An array of permission templates, either as strings or arrays of TokenSegmentInput. Defines the permissions to resolve.
 * @param options - Optional configuration object for resolution, including context, member, permissions, and approval handlers.
 * @returns A promise resolving to ResolveEnsureResult, indicating success or failure with details like tokens, reasons, and approval decisions.
 * @example
 * // Resolve permissions for admin view
 * const result = await resolve(['admin.view'], {
 *   context: { guildId: '123' },
 *   member: someGuildMember,
 *   permissions: { 'admin.view': 'allowed' }
 * });
 * // result: { success: true, detail: { tokens: [['admin', 'view']], requiresApproval: false } }
 */
export async function resolve(
    templates: Array<string | TokenSegmentInput[]>,
    options: ResolveEnsureOptions = {},
): Promise<ResolveEnsureResult> {
    try {
        const context = (options.context ?? {}) as TokenResolveContext;
        const tokens = collectEnsureTokens(templates, context);

        if (tokens.length === 0) {
            return {
                success: true,
                detail: { tokens },
            };
        }

        let member: GuildMember | null | undefined = options.member;

        if (member === undefined && options.getMember) {
            member = await options.getMember();
        }

        const inputs: PermissionTokenInput[] = toInputs(tokens);
        const evaluation = await checkPermission(options.permissions, member ?? null, inputs);

        if (evaluation.allowed) {
            log.debug(`resolve returning success without approval`, `Permission.resolve`);
            return { success: true, detail: { tokens, requiresApproval: !!evaluation.requiresApproval } };
        }

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

        const decision = await options.requestApproval({ tokens, reason: evaluation.reason } as any);

        if (decision === `approve_once` || decision === `approve_forever`) {
            log.debug(`resolve returning success decision=${decision}`, `Permission.resolve`);
            return {
                success: true,
                detail: { tokens, decision },
            };
        }

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
        return {
            success: false,
            detail: {
                tokens: [],
                reason: `Permission resolution error: ${String(error)}`,
            },
        };
    }
}
