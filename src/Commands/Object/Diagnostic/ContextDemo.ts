import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';
import type { TokenSegmentInput } from '../../../Common/permission/index.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName(`context-demo`)
    .setDescription(`Demonstrates execution context caching to avoid recomputation`);

export const permissionTokens: TokenSegmentInput[][] = [[`object`, `diagnostic`, `context-demo`]];

/**
 * Example command demonstrating how to use ExecutionContext to avoid unnecessary recomputation.
 * This simulates expensive operations and shows how caching works.
 */
export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    await ctx.reply({
        content: `Running expensive operations with execution context...`,
        flags: MessageFlags.Ephemeral,
    });

    // Simulate an expensive database query that we want to avoid repeating
    const userData = await ctx.executionContext!.getOrCompute(`user:${ctx.userId}`, async() => {
        // Simulate expensive operation
        await new Promise(resolve => {
            return setTimeout(resolve, 100);
        });
        return {
            id: ctx.userId,
            username: interaction.user.username,
            joinedAt: new Date().toISOString(),
            computedAt: new Date().toISOString(),
        };
    });

    // This second call will use cached data instead of recomputing
    const userData2 = await ctx.executionContext!.getOrCompute<typeof userData>(`user:${ctx.userId}`, async() => {
        // This function won't be called because data is cached
        throw new Error(`This should not be called!`);
    });

    // Verify both calls returned the same data
    const sameData = userData.computedAt === userData2.computedAt;

    // Store some shared state that other parts of the execution can access
    ctx.executionContext!.shared.requestTime = new Date().toISOString();
    ctx.executionContext!.shared.guildInfo = {
        id: ctx.guildId,
        name: interaction.guild?.name,
    };

    // Demonstrate cache statistics
    const stats = ctx.executionContext!.getStats?.() || {
        size: ctx.executionContext!.cache.size,
        keys: Array.from(ctx.executionContext!.cache.keys()),
        createdAt: ctx.executionContext!.createdAt,
        correlationId: ctx.executionContext!.correlationId,
    };

    await interaction.followUp({
        content: `
**Execution Context Demo Results:**

**User Data (cached after first call):**
- ID: ${userData.id}
- Username: ${userData.username}
- Computed at: ${userData.computedAt}

**Cache Statistics:**
- Cache size: ${stats.size}
- Cached keys: ${stats.keys.join(`, `)}
- Context created: ${stats.createdAt.toISOString()}
- Correlation ID: ${stats.correlationId}

**Shared State:**
- Request time: ${ctx.executionContext!.shared.requestTime}
- Guild: ${ctx.executionContext!.shared.guildInfo.name} (${ctx.executionContext!.shared.guildInfo.id})

The second userData call used cached data instead of recomputing!
Cache validation: ${sameData ? `PASSED - Same data returned` : `FAILED - Different data`}
        `.trim(),
        flags: MessageFlags.Ephemeral,
    });
}
