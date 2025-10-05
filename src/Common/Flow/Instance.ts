import type { Interaction, Message } from 'discord.js';
import type { ExecutionContext } from '../../Domain/Command.js';
import type { FlowStep, StepContext } from './Types.js';
import { flowAdvanceId, flowCancelId, flowStepInteractionId, flowStepMessageId, flowStepPromptId } from './Events.js';
import { FlowManager } from './Manager.js';

/**
 * Represents active flow for a single user. Drives step prompts and handlers.
 */
export class FlowInstance<State> {
    private current = 0; // zero-based current step index
    private initialInteraction: Interaction; // initial interaction used to send first prompt

    constructor(
        private userId: string,
        initialInteraction: Interaction,
        private state: State,
        private steps: FlowStep<State>[],
        private manager: FlowManager,
        private executionContext?: ExecutionContext,
    ) {
        this.initialInteraction = initialInteraction;
    }

    /**
     * Begin execution by prompting the initial step.
     * @returns Promise<void> Resolves after the step prompt listeners have been triggered. Example await instance.start().
     */
    public async start() {
        await this.promptCurrent();
    }

    /**
     * Emit the prompt event for the current step, constructing the appropriate step context.
     * @returns Promise<void> Resolves after prompt listeners are invoked. Example await instance['promptCurrent']().
     */
    private async promptCurrent() {
        const step = this.steps[this.current];
        if (step) {
            const ctx: StepContext<State> = {
                userId: this.userId,
                state: this.state,
                interaction: this.initialInteraction,
                advance: this.advance.bind(this),
                cancel: this.cancel.bind(this),
                executionContext: this.executionContext,
            };
            this.manager.events.emitEvent(flowStepPromptId(this.userId, this.current), {
                userId: this.userId,
                stepIndex: this.current,
                step,
                ctx,
            });
        }
    }

    /**
     * Process an interaction for the current step when the custom id matches.
     * @param interaction Interaction Discord interaction routed by the manager. Example ButtonInteraction with matching customId.
     * @returns Promise<void> Resolves after step-specific listeners execute. Example await instance.handleInteraction(interaction).
     */
    public async handleInteraction(interaction: Interaction) {
        const step = this.steps[this.current];
        if (!step) return;
        if (step.customId && 'customId' in interaction && (interaction as any).customId === step.customId) {
            const ctx: StepContext<State> = {
                userId: this.userId,
                state: this.state,
                interaction,
                advance: this.advance.bind(this),
                cancel: this.cancel.bind(this),
                executionContext: this.executionContext,
            };
            this.manager.events.emitEvent(flowStepInteractionId(this.userId, this.current), {
                userId: this.userId,
                stepIndex: this.current,
                step,
                ctx,
                interaction,
            });
        }
    }

    /**
     * Process a message for the current step when a message handler exists.
     * @param message Message Discord message routed by the manager. Example message containing follow-up text.
     * @returns Promise<void> Resolves after message handlers execute. Example await instance.handleMessage(message).
     */
    public async handleMessage(message: Message) {
        const step = this.steps[this.current];
        if (!step) return;
        if (step.handleMessage) {
            const ctx: StepContext<State> = {
                userId: this.userId,
                state: this.state,
                advance: this.advance.bind(this),
                cancel: this.cancel.bind(this),
                executionContext: this.executionContext,
            };
            this.manager.events.emitEvent(flowStepMessageId(this.userId, this.current), {
                userId: this.userId,
                stepIndex: this.current,
                step,
                ctx,
                message,
            });
        }
    }

    /**
     * Advance to the next step, emitting advance events and prompting the subsequent step when available.
     * @returns Promise<void> Resolves after scheduling the next prompt or cancelling. Example await ctx.advance().
     */
    private async advance() {
        const from = this.current;
        this.current++;
        const ctx: StepContext<State> = {
            userId: this.userId,
            state: this.state,
            advance: this.advance.bind(this),
            cancel: this.cancel.bind(this),
            executionContext: this.executionContext,
        };
        this.manager.events.emitEvent(flowAdvanceId(this.userId), {
            userId: this.userId,
            fromStepIndex: from,
            ctx,
        });
        if (this.current < this.steps.length) {
            await this.promptCurrent();
        } else {
            await this.cancel();
        }
    }

    /**
     * Cancel the flow, emit the cancel event, and unregister the flow from the manager.
     * @returns Promise<void> Resolves after the cancel event fires. Example await ctx.cancel().
     */
    public async cancel() {
        const ctx: StepContext<State> = {
            userId: this.userId,
            state: this.state,
            advance: this.advance.bind(this),
            cancel: this.cancel.bind(this),
            executionContext: this.executionContext,
        };
        this.manager.events.emitEvent(flowCancelId(this.userId), {
            userId: this.userId,
            ctx,
        });
        this.manager.internalRemove(this.userId);
    }
}
