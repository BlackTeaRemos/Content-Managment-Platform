import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { listUsers, getUserByDiscordId } from '../../../Flow/Object/User/View.js';
import { log } from '../../../Common/Log.js';
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('view')
    .setDescription('View user details')
    .addUserOption(o => o.setName('user').setDescription('User to view'));

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    const userOption = interaction.options.getUser('user');
    try {
        if (!userOption) {
            // Cache user list per execution context
            const users = await ctx.executionContext!.getOrCompute('users:list', async () => {
                return await listUsers();
            });

            const content = users.map(u => `<@${u.discord_id}> (${u.uid})`).join('\n');
            return await ctx.reply({ content: `Users:\n${content}`, flags: MessageFlags.Ephemeral });
        } else {
            const discordId = userOption.id;
            // Cache user lookup per execution context
            const user = await ctx.executionContext!.getOrCompute(`user:discord:${discordId}`, async () => {
                return await getUserByDiscordId(discordId);
            });

            if (!user) {
                return await ctx.reply({ content: 'User not found', flags: MessageFlags.Ephemeral });
            }
            return await ctx.reply({
                content: `User <@${user.discord_id}>:\nUID: ${user.uid}\nName: ${user.name}\nFriendly Name: ${user.friendly_name}`,
                flags: MessageFlags.Ephemeral,
            });
        }
    } catch (error) {
        log.error(
            `Error retrieving user data: ${error instanceof Error ? error.stack || error.message : String(error)}`,
            'UserViewCommand',
        );
        return await ctx.reply({ content: 'Error retrieving user data', flags: MessageFlags.Ephemeral });
    }
}
