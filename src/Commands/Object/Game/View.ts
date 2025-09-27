import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getGame } from '../../../Flow/Object/Game/View.js';
import { log } from '../../../Common/Log.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View game details')
    .addStringOption(o => o.setName('uid').setDescription('Game UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    const uid = interaction.options.getString('uid', true).trim();
    try {
        // Cache game lookups per execution context to avoid duplicate work
        const game = await ctx.executionContext!.getOrCompute(`game:${uid}`, async () => {
            return await getGame(uid);
        });

        if (!game) {
            return await ctx.reply({ content: 'Game not found', flags: MessageFlags.Ephemeral });
        }
        return await ctx.reply({
            content: `Game ${game.uid}: Name=${game.name}, Image=${game.image}, Server=${game.serverId}`,
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Error retrieving game', message, 'getGame');
        return await ctx.reply({ content: `Error: ${message}`, flags: MessageFlags.Ephemeral });
    }
}
