export * from './buildPermissionEmitter.js';
export * from './evaluateToken.js';
import ComplexEventEmitter from '../ComplexEventEmitter.js';
import type { PermissionEvaluationPayload, PermissionState, PermissionToken, PermissionsObject } from './types.js';
import { normalizeToken } from './tokens.js';

/**
 * Builds a ComplexEventEmitter instance populated with permission listeners.
 * @param permissions PermissionsObject Map containing token strings and associated states (example: { 'command:create': 'allowed' }).
 * @returns ComplexEventEmitter<PermissionEvaluationPayload> Configured emitter used during evaluation (example: ComplexEventEmitter instance).
 * @example
 * const emitter = buildPermissionEmitter({ 'command:create': 'allowed' });
 */
export function buildPermissionEmitter(
    permissions: PermissionsObject,
): ComplexEventEmitter<PermissionEvaluationPayload> {
    const emitter = new ComplexEventEmitter<PermissionEvaluationPayload>();
    for (const [rawToken, state] of Object.entries(permissions)) {
        if (!state || state === `undefined`) {
            continue;
        }
        const token = normalizeToken(rawToken);
        if (!token.length) {
            continue;
        }
        const specificity = token.length;
        emitter.on(token, payload => {
            return payload.consider(state, specificity);
        });
    }
    return emitter;
}

/**
 * Evaluates a token against the configured emitter and returns the most specific state.
 * @param emitter ComplexEventEmitter<PermissionEvaluationPayload> Emitter populated with permission listeners (example: buildPermissionEmitter({...})).
 * @param token PermissionToken Token under evaluation (example: ['command','create']).
 * @returns PermissionState | undefined Resolved permission state if any listener responded (example: 'allowed').
 * @example
 * const state = evaluateToken(emitter, ['command', 'create']);
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
