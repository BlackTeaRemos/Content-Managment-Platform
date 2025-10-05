import type { Interaction, Message } from 'discord.js';
import type { ExecutionContext } from '../../Domain/Command.js';

/**
 * Represents a single step in an interactive flow.
 */
export interface FlowStep<State> {
    /**
     * Unique identifier for interaction component (button or modal) expected in this step.
     * If not applicable, leave undefined.
     */
    customId?: string; // optional component id to match interactions
    /**
     * Handler invoked when this step is activated. Should send prompts (embeds, components) via interaction or message.
     * @example prompts the user with a message and buttons
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
    userId: string; // discord user id
    state: State; // mutable flow state
    interaction?: Interaction; // the initial or current interaction
    advance: () => Promise<void>; // move to next step
    cancel: () => Promise<void>; // cancel the flow
    /** Execution context for caching and shared state across flow steps */
    executionContext?: ExecutionContext;
}
