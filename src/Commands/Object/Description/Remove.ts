import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { removeDescription } from '../../../Flow/Object/Description/Remove.js';
import { log } from '../../../Common/Log.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove a description by UID')
    .addStringOption(o => o.setName('uid').setDescription('Description UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.options.getString('uid', true).trim();
    try {
        const deleted = await removeDescription(uid);
        if (!deleted) {
            return interaction.reply({ content: 'Description not found', ephemeral: true });
        }
        return interaction.reply(`Description ${uid} removed.`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error('Error removing description', msg, 'removeDescription');
        return interaction.reply({ content: `Error: ${msg}`, ephemeral: true });
    }
}
