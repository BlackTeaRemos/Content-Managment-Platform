import ComplexEventEmitter, { EventIdentifier } from '../ComplexEventEmitter.js';
import type { FlowStep } from './Types.js';
import type {
    FlowAdvancePayload,
    FlowCancelPayload,
    FlowInteractionPayload,
    FlowMessagePayload,
    FlowPromptPayload,
} from './Events.js';

/**
 * FlowEventBus wraps ComplexEventEmitter to dispatch flow lifecycle and step events.
 */
export class FlowEventBus<State> extends ComplexEventEmitter<any> {
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
        // Prompt: call step.prompt(ctx)
        this.on(['flow', undefined, 'step', undefined, 'prompt'], (payload: FlowPromptPayload<State>) => {
            const { step, ctx } = payload;
            void step.prompt(ctx);
        });

        // Interaction: if step.customId matches, call step.handleInteraction(ctx, interaction) and optionally advance
        this.on(['flow', undefined, 'step', undefined, 'interaction'], (payload: FlowInteractionPayload<State>) => {
            const { step, ctx, interaction } = payload;
            if (!step.handleInteraction) return;
            void (async () => {
                const ok = await step.handleInteraction!(ctx, interaction);
                if (ok) await ctx.advance();
            })();
        });

        // Message: call step.handleMessage(ctx, message) and optionally advance
        this.on(['flow', undefined, 'step', undefined, 'message'], (payload: FlowMessagePayload<State>) => {
            const { step, ctx, message } = payload;
            if (!step.handleMessage) return;
            void (async () => {
                const ok = await step.handleMessage!(ctx, message);
                if (ok) await ctx.advance();
            })();
        });
        // Advance/Cancel events are emitted for observability; default listeners are no-ops here.
    }
}
