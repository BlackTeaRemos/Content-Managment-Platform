import type { Interaction } from 'discord.js';
import type { ExecutionContext } from '../../Domain/Command.js';
import type { FlowStep } from './Types.js';
import { FlowManager } from './Manager.js';
import { StepBuilder } from './StepBuilder.js';

/**
 * Builder for interactive flows using a fluent API.
 * @example
 * await manager
 *   .builder(userId, interaction, {})
 *   .step('choose')
 *   .prompt(async ctx => {...})
 *   .next()
 *   .start();
 */
export class FlowBuilder<State> {
    private steps: FlowStep<State>[] = [];
    private usedTags = new Set<string>();

    constructor(
        private manager: FlowManager,
        private userId: string,
        private initialInteraction: Interaction,
        private initialState: State,
        private executionContext?: ExecutionContext,
    ) {}

    /**
     * Add a new step with an optional component custom id and tag.
     * @param customId string | undefined Custom id to match for component interactions. Example 'select_type'.
     * @param tag string | undefined Unique tag identifier that allows later steps to recall this step's context. Example 'selectOrganization'.
     * @returns StepBuilder<State> Step builder for configuring the step. Example builder.step('select').
     */
    public step(customId?: string, tag?: string): StepBuilder<State> {
        return new StepBuilder(this, customId, tag);
    }

    /**
     * Collect a configured step into the flow definition.
     * @param step FlowStep<State> Completed step definition from the StepBuilder. Example { prompt: async ctx => {...} }.
     * @returns void Step is stored internally; call chaining is performed by StepBuilder.next().
     */
    public internalAddStep(step: FlowStep<State>) {
        if (step.tag) {
            if (this.usedTags.has(step.tag)) {
                throw new Error(`Duplicate flow step tag detected: ${step.tag}`);
            }
            this.usedTags.add(step.tag);
        }
        this.steps.push(step);
    }

    /**
     * Start the built flow through the underlying manager.
     * @returns Promise<void> Resolves after FlowManager.start completes. Example await builder.start().
     */
    public start(): Promise<void> {
        return this.manager.start(
            this.userId,
            this.initialInteraction,
            this.initialState,
            this.steps,
            this.executionContext,
        );
    }
}
