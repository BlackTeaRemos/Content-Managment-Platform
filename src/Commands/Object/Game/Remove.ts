import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { removeGame } from '../../../Flow/Object/Game/Remove.js';
import { log } from '../../../Common/Log.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove a game')
    .addStringOption(o => o.setName('uid').setDescription('Game UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    const uid = interaction.options.getString('uid', true).trim();
    try {
        const deleted = await removeGame(uid);
        if (!deleted) {
            return await ctx.reply({ content: 'Game not found', flags: MessageFlags.Ephemeral });
        }
        return await ctx.reply({ content: `Game ${uid} removed.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Error removing game', message, 'removeGame');
        return await ctx.reply({ content: `Error: ${message}`, flags: MessageFlags.Ephemeral });
    }
}
