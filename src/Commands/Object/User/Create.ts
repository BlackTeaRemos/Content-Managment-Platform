import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalSubmitInteraction,
} from 'discord.js';
import { createUser } from '../../../Flow/Object/User/Create.js';
import { flowManager } from '../../../Flow/FlowManager.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('Interactive register a new user');

export async function execute(interaction: ChatInputCommandInteraction) {
    // Start interactive flow: ask for Discord ID via modal, then create user
    await flowManager
        .builder(interaction.user.id, interaction as any, { discordId: '' })
        .step('user_id_modal')
        .prompt(async ctx => {
            const modal = new ModalBuilder()
                .setCustomId('user_id_modal')
                .setTitle('Register User')
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('discordId')
                            .setLabel('Discord User ID')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true),
                    ),
                );
            await (ctx.interaction as ChatInputCommandInteraction).showModal(modal);
        })
        .onInteraction(async (ctx, interaction) => {
            if (interaction.isModalSubmit()) {
                const id = interaction.fields.getTextInputValue('discordId').trim();
                ctx.state.discordId = id;
                await interaction.deferUpdate();
                return true;
            }
            return false;
        })
        .next()
        .step()
        .prompt(async ctx => {
            const user = await createUser(ctx.state.discordId!);
            await (ctx.interaction as ChatInputCommandInteraction).followUp({
                content: `User ${user.uid} (${user.discord_id}) created.`,
                ephemeral: true,
            });
        })
        .next()
        .start();
}
