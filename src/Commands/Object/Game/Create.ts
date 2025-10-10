import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    ModalSubmitInteraction,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} from 'discord.js';
import { createGame } from '../../../Flow/Object/Game/Create.js';
import { uploadGameImage } from '../../../Flow/Object/Game/Upload.js';
import { flowManager } from '../../../Common/Flow/Manager.js';
import type { FlowStep } from '../../../Common/Flow/Types.js';
import type { Interaction } from 'discord.js';
import { executeWithContext } from '../../../Common/ExecutionContextHelpers.js';
import type { ExecutionContext } from '../../../Domain/index.js';
import { ensureCommandPermission } from '../../utils/PermissionGuard.js';

interface FlowState {
    serverId: string;
    gameName?: string;
    imageUrl?: string;
}

type StepContext = {
    state: FlowState;
    executionContext?: ExecutionContext;
    interaction: ChatInputCommandInteraction;
    userId: string;
};

export const data = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('Start interactive game creation flow');

export const permissionTokens = 'object:game:create';

export async function execute(interaction: ChatInputCommandInteraction) {
    const serverId = interaction.guildId;
    if (!serverId) {
        return interaction.reply({ content: 'This command must be used in a server.', flags: MessageFlags.Ephemeral });
    }
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        // Start guided flow using builder pattern
        await flowManager
            .builder(interaction.user.id, interaction as Interaction, { serverId }, executionContext)
            .step('game_name_modal')
            .prompt(async (ctx: StepContext) => {
                const modal = new ModalBuilder()
                    .setCustomId('game_name_modal')
                    .setTitle('Set Game Name')
                    .addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('gameName')
                                .setLabel('Game Name')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true),
                        ),
                    );
                await (ctx.interaction as ChatInputCommandInteraction).showModal(modal);
            })
            .onInteraction(async (ctx: StepContext, interaction: any) => {
                if (interaction.isModalSubmit()) {
                    const name = interaction.fields.getTextInputValue('gameName').trim();
                    ctx.state.gameName = name;
                    await interaction.deferUpdate();
                    return true;
                }
                return false;
            })
            .next()
            .step()
            .prompt(async (ctx: StepContext) => {
                await (ctx.interaction as ChatInputCommandInteraction).followUp({
                    content: 'Please send an image attachment or type `skip`.',
                    flags: MessageFlags.Ephemeral,
                });
            })
            .onMessage(async (ctx: StepContext, message: any) => {
                const content = message.content.trim().toLowerCase();
                if (content === 'skip') {
                    ctx.state.imageUrl = '';
                    await message.reply({ content: 'No image will be used.' });
                    return true;
                }
                const attachment = message.attachments.first();
                if (attachment) {
                    const resp = await fetch(attachment.url);
                    const buf = Buffer.from(await resp.arrayBuffer());
                    const url = await uploadGameImage(
                        'game-images',
                        `${ctx.userId}_${Date.now()}_${attachment.name}`,
                        buf,
                        attachment.contentType || 'application/octet-stream',
                    );
                    ctx.state.imageUrl = url;
                    await message.reply({ content: 'Image saved.' });
                    return true;
                }
                return false;
            })
            .next()
            .step()
            .prompt(async (ctx: StepContext) => {
                const permission = await ensureCommandPermission(ctx.interaction as ChatInputCommandInteraction, {
                    templates: ['object:game:create:{serverId}', 'object:game:create'],
                    context: { serverId: ctx.state.serverId },
                });
                if (!permission.allowed) {
                    await (ctx.interaction as ChatInputCommandInteraction).followUp({
                        content: permission.reason ?? 'Permission denied for game creation.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const g = await createGame(ctx.state.gameName!, ctx.state.imageUrl || '', ctx.state.serverId);
                await (ctx.interaction as ChatInputCommandInteraction).followUp({
                    content: `Game created: ${g.uid} '${g.name}'.`,
                });
            })
            .next()
            .start();
    });
}
