import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    MessageFlags,
} from 'discord.js';
import { executeWithContext } from '../../../Common/ExecutionContextHelpers.js';
import type { TokenSegmentInput } from '../../../Common/permission/index.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('flow-demo')
    .setDescription('Demonstrates execution context with interactive flows');

export const permissionTokens: TokenSegmentInput[][] = [['object', 'diagnostic', 'flow-demo']];

interface FlowState {
    selectedOption?: string;
    computedData?: any;
}

/**
 * Example command demonstrating how to use ExecutionContext with FlowManager
 * to avoid recomputation across multiple flow steps.
 */
export async function execute(interaction: ChatInputCommandInteraction) {
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        await flowManager
            .builder(interaction.user.id, interaction, {} as FlowState, executionContext)
            .step('select_option')
            .prompt(async (ctx: { state: FlowState; executionContext?: any }) => {
                // Step 1: Cache some expensive computation that might be needed later
                const expensiveData = await ctx.executionContext?.getOrCompute('expensive-guild-data', async () => {
                    // Simulate expensive operation (e.g., database query)
                    await new Promise(resolve => setTimeout(resolve, 50));
                    return {
                        guildId: interaction.guildId,
                        guildName: interaction.guild?.name,
                        memberCount: interaction.guild?.memberCount,
                        computedAt: new Date().toISOString(),
                    };
                });

                ctx.executionContext.shared.stepCount = 1;
                ctx.executionContext.shared.expensiveDataSize = JSON.stringify(expensiveData).length;

                const select = new StringSelectMenuBuilder()
                    .setCustomId('select_option')
                    .setPlaceholder('Choose an option to see cached data')
                    .addOptions([
                        { label: 'Show Guild Info', value: 'guild' },
                        { label: 'Show User Info', value: 'user' },
                        { label: 'Show Cache Stats', value: 'stats' },
                    ]);

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                await interaction.editReply({
                    content: `**Flow Step 1:** Cached expensive guild data! Select an option:`,
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                });
            })
            .onInteraction(async (ctx: { state: FlowState; executionContext?: any }, interaction: any) => {
                if (!interaction.isStringSelectMenu()) {
                    return false;
                }
                ctx.state.selectedOption = interaction.values[0];
                await interaction.deferUpdate();
                return true;
            })
            .next()
            .step('show_results')
            .prompt(async (ctx: { state: FlowState; executionContext?: any }) => {
                ctx.executionContext.shared.stepCount = 2;

                // Step 2: Use cached data from step 1 and add more caching
                const guildData = await ctx.executionContext?.getOrCompute('expensive-guild-data', () => {
                    throw new Error('This should not be called - data should be cached!');
                });

                const userInfo = await ctx.executionContext?.getOrCompute(
                    `user-info-${interaction.user.id}`,
                    async () => {
                        // Another expensive operation
                        await new Promise(resolve => setTimeout(resolve, 30));
                        return {
                            userId: interaction.user.id,
                            username: interaction.user.username,
                            discriminator: interaction.user.discriminator,
                            computedAt: new Date().toISOString(),
                        };
                    },
                );

                let content = '';
                const option = ctx.state.selectedOption;

                if (option === 'guild') {
                    content = `
**Guild Information (from cache):**
- ID: ${guildData.guildId}
- Name: ${guildData.guildName}
- Members: ${guildData.memberCount}
- Computed at: ${guildData.computedAt}
                    `.trim();
                } else if (option === 'user') {
                    content = `
**User Information (computed and cached):**
- ID: ${userInfo.userId}
- Username: ${userInfo.username}#${userInfo.discriminator}
- Computed at: ${userInfo.computedAt}
                    `.trim();
                } else if (option === 'stats') {
                    const stats = ctx.executionContext?.getStats?.() || {
                        size: ctx.executionContext?.cache.size || 0,
                        keys: Array.from(ctx.executionContext?.cache.keys() || []),
                        createdAt: ctx.executionContext?.createdAt,
                        correlationId: ctx.executionContext?.correlationId,
                    };

                    content = `
**Execution Context Statistics:**
- Cache size: ${stats.size} items
- Cached keys: ${stats.keys.join(', ')}
- Context created: ${stats.createdAt?.toISOString()}
- Correlation ID: ${stats.correlationId}
- Current step: ${ctx.executionContext.shared.stepCount}
- Shared data keys: ${Object.keys(ctx.executionContext.shared).join(', ')}
                    `.trim();
                }

                await (interaction as ChatInputCommandInteraction).followUp({
                    content: `**Flow Step 2 Results:**\n\n${content}\n\n*Data was efficiently cached across flow steps!*`,
                    flags: MessageFlags.Ephemeral,
                });
            })
            .next()
            .start();
    });
}
