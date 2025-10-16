import ComplexEventEmitter from '../ComplexEventEmitter.js';
import type { PermissionEvaluationPayload, PermissionsObject } from './types.js';
import { normalizeToken } from './normalizeToken.js';

/**
 * Builds a ComplexEventEmitter instance populated with permission listeners.
 * @param permissions PermissionsObject Map containing token strings and associated states (example: { 'command:create': 'allowed' }).
 * @returns ComplexEventEmitter<PermissionEvaluationPayload> Configured emitter used during evaluation (example: ComplexEventEmitter instance).
 */
export function buildPermissionEmitter(
    permissions: PermissionsObject,
): ComplexEventEmitter<PermissionEvaluationPayload> {
    const emitter = new ComplexEventEmitter<PermissionEvaluationPayload>();
    for (const [rawToken, state] of Object.entries(permissions)) {
        if (!state || state === 'undefined') {
            continue;
        }
        const token = normalizeToken(rawToken);
        if (!token.length) {
            continue;
        }
        const specificity = token.length;
        emitter.on(token, payload => payload.consider(state, specificity));
    }
    return emitter;
}
