import { Interaction, Message } from 'discord.js';

/**
 * Represents a single step in an interactive flow.
 */
export interface FlowStep<State> {
    /**
     * Unique identifier for interaction component (button or modal) expected in this step.
     * If not applicable, leave undefined.
     */
    customId?: string;
    /**
     * Handler invoked when this step is activated. Should send prompts (embeds, components) via interaction or message.
     */
    prompt: (ctx: StepContext<State>) => Promise<void>;
    /**
     * Handler invoked when an interaction (button/modal) arrives for this step.
     * Return true to advance to next step, false to stay.
     */
    handleInteraction?: (ctx: StepContext<State>, interaction: Interaction) => Promise<boolean>;
    /**
     * Handler invoked when a message arrives for this step.
     * Return true to advance to next step, false to stay.
     */
    handleMessage?: (ctx: StepContext<State>, message: Message) => Promise<boolean>;
}

/**
 * Flow instance context passed to step handlers.
 */
export interface StepContext<State> {
    userId: string;
    state: State;
    interaction?: Interaction;
    advance: () => Promise<void>;
    cancel: () => Promise<void>;
}

/**
 * Manages interactive flows for multiple users.
 */
export class FlowManager<State> {
    private flows = new Map<string, FlowInstance<State>>();

    constructor() {
        // noop
    }

    /**
     * Start a new flow for a user.
     * @param userId unique user identifier
     * @param initialState initial state object
     * @param steps ordered list of steps
     */
    public async start(userId: string, initialInteraction: Interaction, initialState: State, steps: FlowStep<State>[]) {
        // If existing, cancel
        if (this.flows.has(userId)) {
            await this.flows.get(userId)!.cancel();
        }
        const instance = new FlowInstance(userId, initialInteraction, initialState, steps, this);
        this.flows.set(userId, instance);
        await instance.start();
    }

    /**
     * Handle incoming interaction; must be called by event handler.
     */
    public async onInteraction(interaction: Interaction) {
        // Determine user
        const userId = interaction.user?.id;
        if (!userId) return;
        const instance = this.flows.get(userId);
        if (!instance) return;
        await instance.handleInteraction(interaction);
    }

    /**
     * Handle incoming message; must be called by event handler.
     */
    public async onMessage(message: Message) {
        const userId = message.author.id;
        const instance = this.flows.get(userId);
        if (!instance) return;
        await instance.handleMessage(message);
    }

    /**
     * Remove flow instance when done.
     */
    internalRemove(userId: string) {
        this.flows.delete(userId);
    }

    /**
     * Create a FlowBuilder for fluent flow construction.
     */
    public builder(userId: string, initialInteraction: Interaction, initialState: State): FlowBuilder<State> {
        return new FlowBuilder(this, userId, initialInteraction, initialState);
    }
}

/**
 * Represents active flow for a single user.
 */
class FlowInstance<State> {
    private current = 0;
    private initialInteraction: Interaction;

    constructor(
        private userId: string,
        initialInteraction: Interaction,
        private state: State,
        private steps: FlowStep<State>[],
        private manager: FlowManager<State>,
    ) {
        this.initialInteraction = initialInteraction;
    }

    /** Start the first step */
    public async start() {
        await this.promptCurrent();
    }

    private async promptCurrent() {
        const step = this.steps[this.current];
        if (step.prompt) {
            await step.prompt({
                userId: this.userId,
                state: this.state,
                interaction: this.initialInteraction,
                advance: this.advance.bind(this),
                cancel: this.cancel.bind(this),
            });
        }
    }

    public async handleInteraction(interaction: Interaction) {
        const step = this.steps[this.current];
        // Match component interactions (button, modal submit, select menu) by customId
        if (step.customId && 'customId' in interaction && (interaction as any).customId === step.customId) {
            const ctx: StepContext<State> = {
                userId: this.userId,
                state: this.state,
                interaction,
                advance: this.advance.bind(this),
                cancel: this.cancel.bind(this),
            };
            const ok = step.handleInteraction ? await step.handleInteraction(ctx, interaction) : true;
            if (ok) await this.advance();
        }
    }

    public async handleMessage(message: Message) {
        const step = this.steps[this.current];
        if (step.handleMessage) {
            const ctx: StepContext<State> = {
                userId: this.userId,
                state: this.state,
                advance: this.advance.bind(this),
                cancel: this.cancel.bind(this),
            };
            const ok = await step.handleMessage(ctx, message);
            if (ok) await this.advance();
        }
    }

    private async advance() {
        this.current++;
        if (this.current < this.steps.length) {
            await this.promptCurrent();
        } else {
            await this.cancel();
        }
    }

    public async cancel() {
        this.manager.internalRemove(this.userId);
    }
}

/**
 * Singleton FlowManager instance for app flows.
 */
export const flowManager = new FlowManager<any>();

/**
 * Builder for interactive flows using a fluent API.
 */
export class FlowBuilder<State> {
    private steps: FlowStep<State>[] = [];

    constructor(
        private manager: FlowManager<State>,
        private userId: string,
        private initialInteraction: Interaction,
        private initialState: State,
    ) {}

    /**
     * Add a new step with optional customId.
     */
    public step(customId?: string): StepBuilder<State> {
        return new StepBuilder(this, customId);
    }

    /** Internal method to collect steps */
    internalAddStep(step: FlowStep<State>) {
        this.steps.push(step);
    }

    /**
     * Start the built flow.
     */
    public start(): Promise<void> {
        return this.manager.start(this.userId, this.initialInteraction, this.initialState, this.steps);
    }
}

/**
 * Helper to build individual flow steps.
 */
class StepBuilder<State> {
    private step: Partial<FlowStep<State>> = {};

    constructor(
        private builder: FlowBuilder<State>,
        customId?: string,
    ) {
        this.step.customId = customId;
    }

    /** Define the prompt handler for this step */
    public prompt(fn: (ctx: StepContext<State>) => Promise<void>): this {
        this.step.prompt = fn;
        return this;
    }

    /** Define the interaction handler for this step */
    public onInteraction(fn: (ctx: StepContext<State>, interaction: Interaction) => Promise<boolean>): this {
        this.step.handleInteraction = fn;
        return this;
    }

    /** Define the message handler for this step */
    public onMessage(fn: (ctx: StepContext<State>, message: Message) => Promise<boolean>): this {
        this.step.handleMessage = fn;
        return this;
    }

    /** Finalize this step and return to builder */
    public next(): FlowBuilder<State> {
        this.builder.internalAddStep(this.step as FlowStep<State>);
        return this.builder;
    }
}
