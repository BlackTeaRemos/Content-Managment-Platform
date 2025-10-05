import type { Interaction, Message } from 'discord.js';
import type { ExecutionContext } from '../../Domain/Command.js';
import type { FlowStep } from './Types.js';
import { FlowInstance } from './Instance.js';
import { FlowBuilder } from './Builder.js';
import { FlowEventBus } from './EventBus.js';

/**
 * Coordinates interactive flows per Discord user, delegating lifecycle events through the shared event bus.
 * @example
 * const manager = new FlowManager();
 * await manager.start('1234567890', interaction, { step: 0 }, steps);
 */
export class FlowManager {
    private flows = new Map<string, FlowInstance<any>>();
    public readonly events = new FlowEventBus<any>();

    /**
     * Start a new flow for the provided user, cancelling any existing flow owned by the same user.
     * @param userId string Discord snowflake identifying the user. Example '123456789012345678'.
     * @param initialInteraction Interaction Discord interaction used to seed the flow. Example ChatInputCommandInteraction instance.
     * @param initialState State Mutable state object shared across steps. Example { step: 'select' }.
     * @param steps FlowStep<State>[] Ordered list of flow steps to execute. Example [{ prompt: async ctx => {...} }].
     * @param executionContext ExecutionContext Optional execution context shared across steps. Example createExecutionContext().
     * @returns Promise<void> Resolves once the first prompt has been issued. Example await manager.start(...).
     */
    public async start<State>(
        userId: string,
        initialInteraction: Interaction,
        initialState: State,
        steps: FlowStep<State>[],
        executionContext?: ExecutionContext,
    ) {
        if (this.flows.has(userId)) {
            await this.flows.get(userId)!.cancel();
        }
        // Ensure default delegates are registered once per manager
        if (this.events.getEventList().length === 0) {
            this.events.registerDefaultDelegates();
        }
        const instance = new FlowInstance(userId, initialInteraction, initialState, steps, this, executionContext);
        this.flows.set(userId, instance as FlowInstance<any>);
        await instance.start();
    }

    /**
     * Forward an incoming interaction to the active flow bound to the interaction user.
     * @param interaction Interaction Discord interaction instance to process. Example ButtonInteraction.
     * @returns Promise<void> Resolves after flow-specific handlers complete. Example await manager.onInteraction(buttonInteraction).
     */
    public async onInteraction(interaction: Interaction) {
        const userId = (interaction as any).user?.id;
        if (!userId) return;
        const instance = this.flows.get(userId);
        if (!instance) return;
        await instance.handleInteraction(interaction);
    }

    /**
     * Forward an incoming message to the active flow bound to the author.
     * @param message Message Discord message instance to evaluate. Example new incoming DM message.
     * @returns Promise<void> Resolves after flow-specific handlers finish. Example await manager.onMessage(message).
     */
    public async onMessage(message: Message) {
        const userId = (message as any).author.id;
        const instance = this.flows.get(userId);
        if (!instance) return;
        await instance.handleMessage(message);
    }

    /**
     * Remove flow tracking for the supplied user, typically invoked once a flow completes or is cancelled.
     * @param userId string Discord snowflake identifying the user. Example '987654321098765432'.
     * @returns void This method is synchronous; no promise is returned. Example manager.internalRemove('123').
     */
    public internalRemove(userId: string) {
        this.flows.delete(userId);
    }

    /**
     * Create a FlowBuilder for fluent flow construction.
     * @param userId string Discord user identifier. Example '135791357913579135'.
     * @param initialInteraction Interaction Initial Discord interaction that triggered the flow. Example ChatInputCommandInteraction.
     * @param initialState State Mutable state seed for the flow. Example { type: undefined }.
     * @param executionContext ExecutionContext Optional shared execution context. Example createExecutionContext().
     * @returns FlowBuilder<State> Fluent builder configured for the supplied state shape. Example const builder = manager.builder(...).
     */
    public builder<State>(
        userId: string,
        initialInteraction: Interaction,
        initialState: State,
        executionContext?: ExecutionContext,
    ): FlowBuilder<State> {
        return new FlowBuilder(this, userId, initialInteraction, initialState, executionContext);
    }
}

/**
 * Shared FlowManager instance used across the application for coordinating user flows.
 */
export const flowManager = new FlowManager();
