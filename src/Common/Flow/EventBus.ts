import ComplexEventEmitter, { EventIdentifier } from '../ComplexEventEmitter.js';
import { LogLevel, log } from '../Log.js';
import type { FlowStep } from './Types.js';
import {
    anyAdvanceId,
    anyCancelId,
    anyStepInteractionId,
    anyStepMessageId,
    anyStepPromptId,
    FlowAdvancePayload,
    FlowCancelPayload,
    FlowInteractionPayload,
    FlowMessagePayload,
    FlowPromptPayload,
} from './Events.js';

/**
 * Provides a typed structure describing the event being logged by {@link FlowEventBus.registerLoggingDelegates}.
 */
export type FlowLoggingEvent<State> =
    | { kind: 'prompt'; payload: FlowPromptPayload<State> }
    | { kind: 'interaction'; payload: FlowInteractionPayload<State> }
    | { kind: 'message'; payload: FlowMessagePayload<State> }
    | { kind: 'advance'; payload: FlowAdvancePayload<State> }
    | { kind: 'cancel'; payload: FlowCancelPayload<State> };

/**
 * Options controlling how flow logging delegates behave.
 * @template State - Flow state shared between steps. Example { targetType: 'game' }.
 * @property level LogLevel - Logging severity used for emitted entries. Example LogLevel.Debug.
 * @property source string - Logical category passed to the logging utility. Example 'Flow.Debug'.
 * @property formatter (event) => string - Custom message formatter receiving {@link FlowLoggingEvent}. Example event => `Handled ${event.kind}`.
 */
export interface FlowLoggingOptions<State> {
    level?: LogLevel;
    source?: string;
    formatter?: (event: FlowLoggingEvent<State>) => string;
}

const DEFAULT_LOG_SOURCE = 'FlowEventBus';

function defaultFlowLogFormatter<State>(event: FlowLoggingEvent<State>): string {
    switch (event.kind) {
        case 'prompt':
            return `Prompt step ${event.payload.stepIndex} for ${event.payload.userId}`;
        case 'interaction':
            return `Interaction on step ${event.payload.stepIndex} for ${event.payload.userId}`;
        case 'message':
            return `Message on step ${event.payload.stepIndex} for ${event.payload.userId}`;
        case 'advance':
            return `Advance from step ${event.payload.fromStepIndex} for ${event.payload.userId}`;
        case 'cancel':
            return `Cancel flow for ${event.payload.userId}`;
        default:
            return 'Unknown flow event';
    }
}

/**
 * FlowEventBus wraps ComplexEventEmitter to dispatch flow lifecycle and step events.
 */
export class FlowEventBus<State> extends ComplexEventEmitter<any> {
    private loggingRegistered = false; // ensures debug listeners are attached once
    private defaultDelegatesRegistered = false; // prevents duplicate default listeners

    /**
     * Emit a typed event.
     */
    public emitEvent(eventId: EventIdentifier, payload: any) {
        this.emit(eventId, payload);
    }

    /**
     * Register default listeners that call step handlers.
     * These listeners can be overridden by additional listeners registered by the app.
     */
    public registerDefaultDelegates() {
        if (this.defaultDelegatesRegistered) return;
        this.defaultDelegatesRegistered = true;
        // Prompt: call step.prompt(ctx)
        this.on(anyStepPromptId, (payload: FlowPromptPayload<State>) => {
            const { step, ctx } = payload;
            void step.prompt(ctx);
        });

        // Interaction: if step.customId matches, call step.handleInteraction(ctx, interaction) and optionally advance
        this.on(anyStepInteractionId, (payload: FlowInteractionPayload<State>) => {
            const { step, ctx, interaction } = payload;
            if (!step.handleInteraction) return;
            void (async () => {
                const ok = await step.handleInteraction!(ctx, interaction);
                if (ok) await ctx.advance();
            })();
        });

        // Message: call step.handleMessage(ctx, message) and optionally advance
        this.on(anyStepMessageId, (payload: FlowMessagePayload<State>) => {
            const { step, ctx, message } = payload;
            if (!step.handleMessage) return;
            void (async () => {
                const ok = await step.handleMessage!(ctx, message);
                if (ok) await ctx.advance();
            })();
        });
        // Advance/Cancel events are emitted for observability; default listeners are no-ops here.
    }

    /**
     * Attach debug logging listeners for every flow event.
     * @param options FlowLoggingOptions<State> - Optional configuration controlling log level, source and message formatting. Example { level: LogLevel.Info }.
     * @returns void - No return value. Example flowManager.events.registerLoggingDelegates().
     * @example
     * flowManager.events.registerLoggingDelegates({
     *     formatter: event => `Flow ${event.kind} by ${event.payload.userId}`,
     * });
     */
    public registerLoggingDelegates(options: FlowLoggingOptions<State> = {}): void {
        if (this.loggingRegistered) return;
        const level = options.level ?? LogLevel.Debug;
        const source = options.source ?? DEFAULT_LOG_SOURCE;
        const formatter = options.formatter ?? defaultFlowLogFormatter;
        const emitLog = (event: FlowLoggingEvent<State>) => {
            const message = formatter(event);
            if (!message) return;
            log(level, message, source);
        };

        this.on(anyStepPromptId, (payload: FlowPromptPayload<State>) => emitLog({ kind: 'prompt', payload }));
        this.on(anyStepInteractionId, (payload: FlowInteractionPayload<State>) =>
            emitLog({ kind: 'interaction', payload }),
        );
        this.on(anyStepMessageId, (payload: FlowMessagePayload<State>) => emitLog({ kind: 'message', payload }));
        this.on(anyAdvanceId, (payload: FlowAdvancePayload<State>) => emitLog({ kind: 'advance', payload }));
        this.on(anyCancelId, (payload: FlowCancelPayload<State>) => emitLog({ kind: 'cancel', payload }));

        this.loggingRegistered = true;
    }
}
