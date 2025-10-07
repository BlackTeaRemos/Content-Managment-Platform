import type { Interaction, Message } from 'discord.js';
import type { ExecutionContext } from '../../Domain/Command.js';
import type { FlowStep, StepContext, StepSnapshot } from './Types.js';
import { flowAdvanceId, flowCancelId, flowStepInteractionId, flowStepMessageId, flowStepPromptId } from './Events.js';
import { FlowManager } from './Manager.js';

/**
 * Represents active flow for a single user. Drives step prompts and handlers.
 */
export class FlowInstance<State> {
    private current = 0; // zero-based current step index
    private initialInteraction: Interaction; // initial interaction used to send first prompt
    private historyByTag = new Map<string, StepSnapshot<State>>();

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
            if (step.tag) {
                this.ensureSnapshot(step, this.current);
            }
            const ctx = this.buildContext(step, this.current, this.initialInteraction);
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
            const snapshot = step.tag ? this.ensureSnapshot(step, this.current) : undefined;
            const ctx = this.buildContext(step, this.current, interaction);
            if (snapshot) {
                snapshot.lastInteraction = interaction;
            }
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
            const snapshot = step.tag ? this.ensureSnapshot(step, this.current) : undefined;
            const ctx = this.buildContext(step, this.current);
            if (snapshot) {
                snapshot.lastMessage = message;
            }
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
        const ctx = this.buildContext();
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
        const ctx = this.buildContext();
        this.manager.events.emitEvent(flowCancelId(this.userId), {
            userId: this.userId,
            ctx,
        });
        this.manager.internalRemove(this.userId);
    }

    private buildContext(
        step?: FlowStep<State>,
        stepIndex = this.current,
        interaction?: Interaction,
    ): StepContext<State> {
        const guardIndex = step ? stepIndex : this.current;
        const getStep = (tag: string): StepSnapshot<State> | undefined => {
            const entry = this.historyByTag.get(tag);
            if (!entry) return undefined;
            if (entry.stepIndex >= guardIndex) return undefined;
            return entry;
        };
        const recall = <T = unknown>(tag: string, key: string): T | undefined => {
            const entry = getStep(tag);
            if (!entry) return undefined;
            return entry.data[key] as T | undefined;
        };
        const remember = (key: string, value: unknown): void => {
            if (!step || !step.tag) {
                throw new Error('Cannot store data for an untagged step. Provide a tag when defining this step.');
            }
            const snapshot = this.ensureSnapshot(step, stepIndex);
            snapshot.data[key] = value;
        };
        return {
            userId: this.userId,
            state: this.state,
            interaction,
            advance: this.advance.bind(this),
            cancel: this.cancel.bind(this),
            executionContext: this.executionContext,
            tag: step?.tag,
            remember,
            recall,
            getStep,
        };
    }

    private ensureSnapshot(step: FlowStep<State>, stepIndex: number): StepSnapshot<State> {
        if (!step.tag) {
            throw new Error('Cannot capture snapshot for step without a tag.');
        }
        let snapshot = this.historyByTag.get(step.tag);
        if (!snapshot) {
            snapshot = {
                tag: step.tag,
                stepIndex,
                data: {},
                state: this.state,
            };
            this.historyByTag.set(step.tag, snapshot);
        } else {
            snapshot.stepIndex = stepIndex;
            snapshot.state = this.state;
        }
        return snapshot;
    }
}
