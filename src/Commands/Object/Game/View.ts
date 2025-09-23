import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getGame } from '../../../Flow/Object/Game/View.js';
import { log } from '../../../Common/Log.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View game details')
    .addStringOption(o => o.setName('uid').setDescription('Game UID').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.options.getString('uid', true).trim();
    try {
        const game = await getGame(uid);
        if (!game) {
            return interaction.reply({ content: 'Game not found', ephemeral: true });
        }
        return interaction.reply(`Game ${game.uid}: Name=${game.name}, Image=${game.image}, Server=${game.serverId}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Error retrieving game', message, 'getGame');
        return interaction.reply({ content: `Error: ${message}`, ephemeral: true });
    }
}
