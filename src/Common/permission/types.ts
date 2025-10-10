/**
 * Shared permission model types used across the application.
 * @example
 * import type { PermissionState } from './types.js';
 */
import type { EventIdentifier, EventIdentifierSubset } from '../ComplexEventEmitter.js';

/**
 * Permission states used to express whether an action should be allowed.
 * @example
 * const nextState: PermissionState = 'allowed';
 */
export type PermissionState = 'undefined' | 'forbidden' | 'once' | 'allowed';

/**
 * Describes a permission map where keys are tokens and values define behaviour.
 * @example
 * const permissions: PermissionsObject = { 'command:create': 'allowed' };
 */
export type PermissionsObject = Record<string, PermissionState>;

/**
 * Token representation consumed by ComplexEventEmitter.
 * @example
 * const sampleToken: PermissionToken = ['command', 'create'];
 */
export type PermissionToken = EventIdentifier;

/**
 * Allowed template values that are converted into token segments.
 * @example
 * const segments: TokenSegmentInput[] = ['command', 'create'];
 */
export type TokenSegmentInput = EventIdentifierSubset | string | number | boolean | null | undefined;

/**
 * Supported inputs when providing permission tokens.
 * @example
 * const input: PermissionTokenInput = 'command:create';
 */
export type PermissionTokenInput = string | TokenSegmentInput[];

/**
 * Result returned by a permission evaluation request.
 * @example
 * const result: PermissionCheckResult = { allowed: true };
 */
export interface PermissionCheckResult {
    allowed: boolean; // indicates immediate permission, example: true
    reason?: string; // human readable explanation, example: 'Explicitly forbidden'
    missing?: string[]; // tokens that require approval, example: ['command:create']
    requiresApproval?: boolean; // whether admin approval is required, example: true
}

/**
 * Decision communicated after requesting permission approval from administrators.
 * @example
 * const decision: PermissionDecision = 'approve_once';
 */
export type PermissionDecision = 'approve_once' | 'approve_forever' | 'deny' | 'no_admin' | 'timeout';

/**
 * Payload emitted while evaluating tokens through ComplexEventEmitter.
 * @example
 * emitter.emit(token, { consider: () => undefined });
 */
export interface PermissionEvaluationPayload {
    consider: (state: PermissionState, specificity: number) => void; // callback executed per matching listener
}
