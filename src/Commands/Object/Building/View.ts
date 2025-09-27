import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getFactory } from '../../../Flow/Object/Building/View.js';
import { log } from '../../../Common/Log.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View factory details')
    .addStringOption(o => o.setName('uid').setDescription('Factory UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    const uid = interaction.options.getString('uid', true).trim();
    try {
        // Cache factory lookups per execution context
        const factory = await ctx.executionContext!.getOrCompute(`factory:${uid}`, async () => {
            return await getFactory(uid);
        });

        if (!factory) {
            return await ctx.reply({ content: 'Factory not found', flags: MessageFlags.Ephemeral });
        }
        return await ctx.reply({
            content: `Factory ${factory.uid}: Type=${factory.type}, Description=${factory.description}, Organization=${factory.organizationUid}`,
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Error retrieving factory', errorMessage, 'getFactory');
        return await ctx.reply({ content: 'Error retrieving factory', flags: MessageFlags.Ephemeral });
    }
}
