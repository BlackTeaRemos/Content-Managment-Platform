import { ChatInputCommandInteraction } from 'discord.js';
import { CommandExecutionContext, createExecutionContext } from '../Domain/index.js';

/**
 * Utility functions to help bridge between Discord.js commands and the execution context system.
 * These functions help existing commands adopt the execution context pattern.
 */

/**
 * Create a CommandExecutionContext from a Discord.js ChatInputCommandInteraction.
 * This helper is useful for migrating existing commands to use execution context.
 *
 * @param interaction Discord.js ChatInputCommandInteraction
 * @param correlationId Optional correlation ID for tracing
 * @returns CommandExecutionContext with execution context populated
 *
 * @example
 * export async function execute(interaction: ChatInputCommandInteraction) {
 *   const ctx = createCommandContext(interaction);
 *
 *   // Use execution context to avoid recomputation
 *   const expensiveData = await ctx.executionContext.getOrCompute(
 *     'expensive-query',
 *     () => performExpensiveQuery()
 *   );
 *
 *   await ctx.reply(`Result: ${expensiveData}`);
 * }
 */
export function createCommandContext(
    interaction: ChatInputCommandInteraction,
    correlationId?: string,
): CommandExecutionContext {
    const executionContext = createExecutionContext(correlationId);

    return {
        guildId: interaction.guildId || '',
        userId: interaction.user.id,
        channelId: interaction.channelId,
        options: Object.fromEntries(interaction.options.data.map(option => [option.name, option.value])),
        reply: async message => {
            if (typeof message === 'string') {
                return await interaction.reply({ content: message });
            }
            return await interaction.reply(message);
        },
        correlationId,
        executionContext,
    };
}

/**
 * Create execution context and pass it to flow manager for commands using flows.
 * This helper makes it easy to add execution context to flow-based commands.
 *
 * @param interaction Discord.js interaction
 * @param flowBuilderFn Function that uses the flow builder
 * @param correlationId Optional correlation ID
 *
 * @example
 * export async function execute(interaction: ChatInputCommandInteraction) {
 *   await executeWithContext(interaction, (flowManager, executionContext) =>
 *     flowManager
 *       .builder(interaction.user.id, interaction, {}, executionContext)
 *       .step('my_step')
 *       .prompt(async ctx => {
 *         // ctx.executionContext is available here
 *         const cached = await ctx.executionContext?.getOrCompute('key', () => 'value');
 *         // ... rest of flow
 *       })
 *       .next()
 *       .start()
 *   );
 * }
 */
export async function executeWithContext(
    interaction: ChatInputCommandInteraction,
    flowBuilderFn: (flowManager: any, executionContext: any) => Promise<void>,
    correlationId?: string,
): Promise<void> {
    const executionContext = createExecutionContext(correlationId);
    const { flowManager } = await import('../Flow/FlowManager.js');

    await flowBuilderFn(flowManager, executionContext);
}
