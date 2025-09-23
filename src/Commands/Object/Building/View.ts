import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getFactory } from '../../../Flow/Object/Building/View.js';
import { log } from '../../../Common/Log.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View factory details')
    .addStringOption(o => o.setName('uid').setDescription('Factory UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.options.getString('uid', true).trim();
    try {
        const factory = await getFactory(uid);
        if (!factory) {
            return interaction.reply({ content: 'Factory not found', ephemeral: true });
        }
        return interaction.reply(
            `Factory ${factory.uid}: Type=${factory.type}, Description=${factory.description}, Organization=${factory.organizationUid}`,
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Error retrieving factory', errorMessage, 'getFactory');
        return interaction.reply({ content: 'Error retrieving factory', ephemeral: true });
    }
}
