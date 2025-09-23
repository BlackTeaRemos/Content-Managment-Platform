import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { removeFactory } from '../../../Flow/Object/Building/Remove.js';
import { log } from '../../../Common/Log.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove a factory')
    .addStringOption(o => o.setName('uid').setDescription('Factory UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.options.getString('uid', true).trim();
    try {
        const deleted = await removeFactory(uid);
        if (!deleted) {
            return interaction.reply({ content: 'Factory not found', ephemeral: true });
        }
        return interaction.reply(`Factory ${uid} removed.`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Error removing factory', errorMessage, 'removeFactory');
        return interaction.reply({ content: 'Error removing factory', ephemeral: true });
    }
}
