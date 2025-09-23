import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalSubmitInteraction,
} from 'discord.js';
import { createDescription } from '../../../Flow/Object/Description/Create.js';
import { log } from '../../../Common/Log.js';
import { flowManager } from '../../../Flow/FlowManager.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('Add a description to a reference object');

export async function execute(interaction: ChatInputCommandInteraction) {
    // Interactive flow: collect refType, refUid, and description text
    await flowManager
        .builder(interaction.user.id, interaction as any, { refType: '', refUid: '', text: '' })
        .step('desc_modal')
        .prompt(async ctx => {
            const modal = new ModalBuilder()
                .setCustomId('desc_modal')
                .setTitle('New Description')
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('refType')
                            .setLabel('Reference Type (organization/game/user)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true),
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('refUid')
                            .setLabel('Reference UID')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true),
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('text')
                            .setLabel('Description Text')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true),
                    ),
                );
            await (ctx.interaction as ChatInputCommandInteraction).showModal(modal);
        })
        .onInteraction(async (ctx, interaction) => {
            if (interaction.isModalSubmit()) {
                const fields = interaction.fields;
                ctx.state.refType = fields.getTextInputValue('refType') as 'organization' | 'game' | 'user';
                ctx.state.refUid = fields.getTextInputValue('refUid').trim();
                ctx.state.text = fields.getTextInputValue('text').trim();
                await interaction.deferUpdate();
                return true;
            }
            return false;
        })
        .next()
        .step()
        .prompt(async ctx => {
            try {
                const desc = await createDescription(ctx.state.refType, ctx.state.refUid, ctx.state.text);
                await (ctx.interaction as ChatInputCommandInteraction).followUp({
                    content: `Description ${desc.uid} created for ${ctx.state.refType} ${ctx.state.refUid}.`,
                    ephemeral: true,
                });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                log.error('Error creating description', msg, 'createDescription');
                await (ctx.interaction as ChatInputCommandInteraction).followUp({
                    content: `Error: ${msg}`,
                    ephemeral: true,
                });
            }
        })
        .next()
        .start();
}
