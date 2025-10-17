import type { PermissionEvaluationPayload, PermissionState, PermissionToken } from './types.js';
import type ComplexEventEmitter from '../ComplexEventEmitter.js';

/**
 * Evaluates a permission token by emitting it to an event emitter and collecting the most specific permission state.
 *
 * This function creates a payload with a 'consider' method that listeners can use to propose permission states with associated specificity levels.
 * It emits the token to the emitter, allowing registered handlers to evaluate and respond, then returns the state with the highest specificity.
 *
 * @param emitter - The event emitter that handles permission evaluation events for the token.
 *   Example: A ComplexEventEmitter instance with permission handlers attached.
 * @param token - The permission token to evaluate.
 *   Example: { segments: ['user', 'edit'], variables: {} }
 * @returns The permission state with the highest specificity, or undefined if no state was considered.
 *   Example: 'allowed' or 'denied'
 */
export function evaluateToken(
    emitter: ComplexEventEmitter<PermissionEvaluationPayload>,
    token: PermissionToken,
): PermissionState | undefined {
    const evaluation = { specificity: -1, state: undefined as PermissionState | undefined };
    const payload: PermissionEvaluationPayload = {
        consider: (state, specificity) => {
            if (specificity < evaluation.specificity) {
                return;
            }
            evaluation.specificity = specificity;
            evaluation.state = state;
        },
    };
    emitter.emit(token, payload);
    return evaluation.state;
}
