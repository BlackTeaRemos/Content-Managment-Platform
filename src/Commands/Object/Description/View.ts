import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getDescription } from '../../../Flow/Object/Description/View.js';
import { log } from '../../../Common/Log.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View a description by UID')
    .addStringOption(o => o.setName('uid').setDescription('Description UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.options.getString('uid', true).trim();
    try {
        const desc = await getDescription(uid);
        if (!desc) {
            return interaction.reply({ content: 'Description not found', flags: MessageFlags.Ephemeral });
        }
        // If large text, it should fetch from MinIO - not implemented
        return interaction.reply(`Description ${desc.uid}: ${desc.text}`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error('Error retrieving description', msg, 'getDescription');
        return interaction.reply({ content: `Error: ${msg}`, flags: MessageFlags.Ephemeral });
    }
}
