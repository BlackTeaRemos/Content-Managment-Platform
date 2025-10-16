import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { removeFactory } from '../../../Flow/Object/Building/Remove.js';
import { log } from '../../../Common/Log.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';
import type { TokenSegmentInput } from '../../../Common/permission/index.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove a factory')
    .addStringOption(o => o.setName('uid').setDescription('Factory UID').setRequired(true));

export const permissionTokens: TokenSegmentInput[][] = [['object', 'building', 'remove']];

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    const uid = interaction.options.getString('uid', true).trim();
    try {
        const deleted = await removeFactory(uid);
        if (!deleted) {
            return await ctx.reply({ content: 'Factory not found', flags: MessageFlags.Ephemeral });
        }
        return await ctx.reply({ content: `Factory ${uid} removed.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Error removing factory', errorMessage, 'removeFactory');
        return await ctx.reply({ content: 'Error removing factory', flags: MessageFlags.Ephemeral });
    }
}
