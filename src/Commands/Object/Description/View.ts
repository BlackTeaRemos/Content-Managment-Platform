import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getDescription } from '../../../Flow/Object/Description/View.js';
import { log } from '../../../Common/Log.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View a description by UID')
    .addStringOption(o => o.setName('uid').setDescription('Description UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    const uid = interaction.options.getString('uid', true).trim();
    try {
        // Cache description lookups per execution context
        const desc = await ctx.executionContext!.getOrCompute(`description:${uid}`, async () => {
            return await getDescription(uid);
        });

        if (!desc) {
            return await ctx.reply({ content: 'Description not found', flags: MessageFlags.Ephemeral });
        }
        // If large text, it should fetch from MinIO - not implemented
        return await ctx.reply({ content: `Description ${desc.uid}: ${desc.text}`, flags: MessageFlags.Ephemeral });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error('Error retrieving description', msg, 'getDescription');
        return await ctx.reply({ content: `Error: ${msg}`, flags: MessageFlags.Ephemeral });
    }
}
