import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getOrganizationWithMembers } from '../../../Flow/Object/Organization/View.js';
import { log } from '../../../Common/Log.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View organization details and members')
    .addStringOption(o => o.setName('uid').setDescription('Organization UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const uidArg = interaction.options.getString('uid', true)!.trim();
    try {
        const result = await getOrganizationWithMembers(uidArg);
        if (!result) {
            return interaction.reply({ content: 'Organization not found', ephemeral: true });
        }
        const { organization, users } = result;
        return interaction.reply({
            content: `Organization ${organization.uid} '${organization.name}' has ${users.length} members.`,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Error retrieving organization data', errorMessage, 'getOrganizationWithMembers');
        return interaction.reply({ content: 'Error retrieving organization data', ephemeral: true });
    }
}
