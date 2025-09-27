import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalSubmitInteraction,
    MessageFlags,
} from 'discord.js';
import { createUser } from '../../../Flow/Object/User/Create.js';
import { flowManager } from '../../../Flow/FlowManager.js';
import { executeWithContext } from '../../../Common/ExecutionContextHelpers.js';
import { checkCommandPermissions } from '../../../Common/PermissionMiddleware.js';
import type { ExecutionContext } from '../../../Domain/index.js';

interface FlowState {
    discordId: string;
}

type StepContext = {
    state: FlowState;
    executionContext?: ExecutionContext;
    interaction: ChatInputCommandInteraction;
    userId: string;
};

export const data = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('Interactive register a new user');

export async function execute(interaction: ChatInputCommandInteraction) {
    // Check permissions first
    const permissionResult = await checkCommandPermissions(interaction, {
        requiredPermissions: ['command.object.user.create'],
        requiredTags: ['user_management'],
        adminOnly: false
    });

    if (!permissionResult.allowed) {
        // Permission denied, response already sent by middleware
        return;
    }

    // Permission granted, proceed with command execution
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        // Start interactive flow: ask for Discord ID via modal, then create user
        await flowManager
            .builder(interaction.user.id, interaction as any, { discordId: '' }, executionContext)
            .step('user_id_modal')
            .prompt(async (ctx: StepContext) => {
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
            .onInteraction(async (ctx: StepContext, interaction: any) => {
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
            .prompt(async (ctx: StepContext) => {
                const user = await createUser(ctx.state.discordId!);
                await (ctx.interaction as ChatInputCommandInteraction).followUp({
                    content: `User ${user.uid} (${user.discord_id}) created.`,
                    flags: MessageFlags.Ephemeral,
                });
            })
            .next()
            .start();
    });
}
