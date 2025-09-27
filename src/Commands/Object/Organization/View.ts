import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getOrganizationWithMembers } from '../../../Flow/Object/Organization/View.js';
import { log } from '../../../Common/Log.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View organization details and members')
    .addStringOption(o => o.setName('uid').setDescription('Organization UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    const uidArg = interaction.options.getString('uid', true)!.trim();
    try {
        // Cache organization lookups per execution context to avoid duplicate work
        const result = await ctx.executionContext!.getOrCompute(`organization:${uidArg}`, async () => {
            return await getOrganizationWithMembers(uidArg);
        });

        if (!result) {
            return await ctx.reply({ content: 'Organization not found', flags: MessageFlags.Ephemeral });
        }

        const { organization, users } = result;
        return await ctx.reply({
            content: `Organization ${organization.uid} '${organization.name}' has ${users.length} members.`,
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Error retrieving organization data', errorMessage, 'getOrganizationWithMembers');
        return await ctx.reply({ content: 'Error retrieving organization data', flags: MessageFlags.Ephemeral });
    }
}
