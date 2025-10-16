import type { GuildMember } from 'discord.js';
import type { PermissionToken, PermissionsObject, PermissionDecision, TokenSegmentInput } from '../types.js';

/**
 * Context available when resolving permission token templates.
 */
export interface TokenResolveContext {
    commandName?: string;
    options?: Record<string, any>;
    userId?: string;
    guildId?: string;
    [key: string]: any;
}

/**
 * Payload provided to approval flow delegates when permissions require admin confirmation.
 */
export interface ResolveApprovalPayload {
    tokens: PermissionToken[];
    reason?: string;
}

/**
 * Options passed to ensure for evaluating and approving permission tokens.
 */
export interface ResolveEnsureOptions {
    context?: TokenResolveContext;
    permissions?: PermissionsObject;
    member?: GuildMember | null;
    getMember?: () => Promise<GuildMember | null>;
    requestApproval?: (payload: ResolveApprovalPayload) => Promise<PermissionDecision | undefined>;
    skipApproval?: boolean;
}

/**
 * Detailed outcome returned by ensure containing tokens, reasons and decisions.
 */
export interface ResolveEnsureDetail {
    tokens: PermissionToken[];
    reason?: string;
    decision?: PermissionDecision;
    requiresApproval?: boolean;
}

/**
 * Result returned by ensure.
 */
export interface ResolveEnsureResult {
    success: boolean;
    detail: ResolveEnsureDetail;
}
