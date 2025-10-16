import type { PermissionEvaluationPayload, PermissionState, PermissionToken } from './types.js';
import type ComplexEventEmitter from '../ComplexEventEmitter.js';

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
