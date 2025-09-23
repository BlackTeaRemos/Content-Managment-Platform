import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { removeGame } from '../../../Flow/Object/Game/Remove.js';
import { log } from '../../../Common/Log.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove a game')
    .addStringOption(o => o.setName('uid').setDescription('Game UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.options.getString('uid', true).trim();
    try {
        const deleted = await removeGame(uid);
        if (!deleted) {
            return interaction.reply({ content: 'Game not found', ephemeral: true });
        }
        return interaction.reply(`Game ${uid} removed.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Error removing game', message, 'removeGame');
        return interaction.reply({ content: `Error: ${message}`, ephemeral: true });
    }
}
