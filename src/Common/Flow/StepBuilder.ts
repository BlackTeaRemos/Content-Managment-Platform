import type { FlowStep } from './Types.js';
import type { FlowBuilder } from './Builder.js';
import type { Interaction, Message } from 'discord.js';

/**
 * Helper to build individual flow steps.
 * @example
 * builder.step('confirm').prompt(async ctx => {...}).onInteraction(async (ctx, i) => true).next();
 */
export class StepBuilder<State> {
    private step: Partial<FlowStep<State>> = {};

    constructor(
        private builder: FlowBuilder<State>,
        customId?: string,
        tag?: string,
    ) {
        this.step.customId = customId;
        this.step.tag = tag;
    }

    /**
     * Define the prompt handler for this step.
     * @param fn FlowStep<State>['prompt'] Asynchronous prompt callback executed when the step activates. Example async ctx => {...}.
     * @returns this Allows fluent chaining to configure additional handlers. Example step.prompt(handler).
     */
    public prompt(fn: FlowStep<State>[`prompt`]): this {
        this.step.prompt = fn;
        return this;
    }

    /**
     * Define the interaction handler for this step.
     * @param fn (ctx, interaction) => Promise<boolean> Handler invoked for matching component interactions. Example async (ctx, interaction) => true.
     * @returns this Enables chaining for further configuration. Example step.onInteraction(handler).
     */
    public onInteraction(
        fn: (
            ctx: Parameters<NonNullable<FlowStep<State>[`handleInteraction`]>>[0],
            interaction: Interaction,
        ) => Promise<boolean>,
    ): this {
        this.step.handleInteraction = fn;
        return this;
    }

    /**
     * Define the message handler for this step.
     * @param fn (ctx, message) => Promise<boolean> Handler invoked when a message arrives. Example async (ctx, message) => true.
     * @returns this Enables fluent chaining. Example step.onMessage(handler).
     */
    public onMessage(
        fn: (ctx: Parameters<NonNullable<FlowStep<State>[`handleMessage`]>>[0], message: Message) => Promise<boolean>,
    ): this {
        this.step.handleMessage = fn;
        return this;
    }

    /**
     * Finalize this step and return to the parent builder.
     * @returns FlowBuilder<State> Reference to the owning builder for further configuration. Example step.next().
     */
    public next(): FlowBuilder<State> {
        this.builder.internalAddStep(this.step as FlowStep<State>);
        return this.builder;
    }
}
