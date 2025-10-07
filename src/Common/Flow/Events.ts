import type { Interaction, Message } from 'discord.js';
import type { FlowStep, StepContext } from './Types.js';

// Flow event identifier builder utilities. Event identifiers are arrays used by ComplexEventEmitter
// ['flow', userId, 'step', stepIndex, 'prompt' | 'interaction' | 'message']
// ['flow', userId, 'advance']
// ['flow', userId, 'cancel']

export type FlowEventId = (string | number | boolean | undefined)[];

export const FLOW_NAMESPACE = 'flow' as const;

export const flowStepPromptId = (userId: string, stepIndex: number): FlowEventId => [
    FLOW_NAMESPACE,
    userId,
    'step',
    stepIndex,
    'prompt',
];
export const flowStepInteractionId = (userId: string, stepIndex: number): FlowEventId => [
    FLOW_NAMESPACE,
    userId,
    'step',
    stepIndex,
    'interaction',
];
export const flowStepMessageId = (userId: string, stepIndex: number): FlowEventId => [
    FLOW_NAMESPACE,
    userId,
    'step',
    stepIndex,
    'message',
];
export const flowAdvanceId = (userId: string): FlowEventId => [FLOW_NAMESPACE, userId, 'advance'];
export const flowCancelId = (userId: string): FlowEventId => [FLOW_NAMESPACE, userId, 'cancel'];

// Wildcard listener ids useful for registering generic listeners
export const anyStepPromptId: FlowEventId = [FLOW_NAMESPACE, undefined, 'step', undefined, 'prompt'];
export const anyStepInteractionId: FlowEventId = [FLOW_NAMESPACE, undefined, 'step', undefined, 'interaction'];
export const anyStepMessageId: FlowEventId = [FLOW_NAMESPACE, undefined, 'step', undefined, 'message'];
export const anyAdvanceId: FlowEventId = [FLOW_NAMESPACE, undefined, 'advance'];
export const anyCancelId: FlowEventId = [FLOW_NAMESPACE, undefined, 'cancel'];

// Payloads carried through the event bus. These are runtime-validated by usage; typings here are for developer guidance.

export interface FlowPromptPayload<State> {
    userId: string;
    stepIndex: number;
    step: FlowStep<State>;
    ctx: StepContext<State>;
}

export interface FlowInteractionPayload<State> {
    userId: string;
    stepIndex: number;
    step: FlowStep<State>;
    ctx: StepContext<State>;
    interaction: Interaction;
}

export interface FlowMessagePayload<State> {
    userId: string;
    stepIndex: number;
    step: FlowStep<State>;
    ctx: StepContext<State>;
    message: Message;
}

export interface FlowAdvancePayload<State> {
    userId: string;
    fromStepIndex: number;
    ctx: StepContext<State>;
}

export interface FlowCancelPayload<State> {
    userId: string;
    ctx: StepContext<State>;
}
