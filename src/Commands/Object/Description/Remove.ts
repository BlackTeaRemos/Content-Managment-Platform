import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { removeDescription } from '../../../Flow/Object/Description/Remove.js';
import { log } from '../../../Common/Log.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';
import type { TokenSegmentInput } from '../../../Common/permission/index.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove a description by UID')
    .addStringOption(o => o.setName('uid').setDescription('Description UID').setRequired(true));

export const permissionTokens: TokenSegmentInput[][] = [['object', 'description', 'remove']];

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    const uid = interaction.options.getString('uid', true).trim();
    try {
        const deleted = await removeDescription(uid);
        if (!deleted) {
            return await ctx.reply({ content: 'Description not found', flags: MessageFlags.Ephemeral });
        }
        return await ctx.reply({ content: `Description ${uid} removed.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error('Error removing description', msg, 'removeDescription');
        return await ctx.reply({ content: `Error: ${msg}`, flags: MessageFlags.Ephemeral });
    }
}
