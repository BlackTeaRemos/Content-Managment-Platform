import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { listUsers, getUserByDiscordId } from '../../../Flow/Object/User/View.js';
import { log } from '../../../Common/Log.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View user details')
    .addUserOption(o => o.setName('user').setDescription('User to view'));

export async function execute(interaction: ChatInputCommandInteraction) {
    const userOption = interaction.options.getUser('user');
    try {
        if (!userOption) {
            const users = await listUsers();
            const content = users.map(u => `<@${u.discord_id}> (${u.uid})`).join('\n');
            return interaction.reply({ content: `Users:\n${content}`, ephemeral: true });
        } else {
            const discordId = userOption.id;
            const user = await getUserByDiscordId(discordId);
            if (!user) {
                return interaction.reply({ content: 'User not found', ephemeral: true });
            }
            return interaction.reply(
                `User <@${user.discord_id}>:\nUID: ${user.uid}\nName: ${user.name}\nFriendly Name: ${user.friendly_name}`,
            );
        }
    } catch (error) {
        log.error(
            `Error retrieving user data: ${error instanceof Error ? error.stack || error.message : String(error)}`,
            'UserViewCommand',
        );
        return interaction.reply({ content: 'Error retrieving user data', ephemeral: true });
    }
}
