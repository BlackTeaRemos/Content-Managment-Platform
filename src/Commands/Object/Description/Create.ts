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
import { createDescription } from '../../../Flow/Object/Description/Create.js';
import { log } from '../../../Common/Log.js';
import { flowManager } from '../../../Common/Flow/Manager.js';
import { executeWithContext } from '../../../Common/ExecutionContextHelpers.js';
import type { ExecutionContext } from '../../../Domain/index.js';

interface FlowState {
    refType: 'organization' | 'game' | 'user';
    refUid: string;
    text: string;
}

type StepContext = {
    state: FlowState;
    executionContext?: ExecutionContext;
    interaction: ChatInputCommandInteraction;
    userId: string;
};

export const data = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('Add a description to a reference object');

export async function execute(interaction: ChatInputCommandInteraction) {
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        // Interactive flow: collect refType, refUid, and description text
        await flowManager
            .builder(interaction.user.id, interaction as any, { refType: '', refUid: '', text: '' }, executionContext)
            .step('desc_modal')
            .prompt(async (ctx: StepContext) => {
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
            .onInteraction(async (ctx: StepContext, interaction: any) => {
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
            .prompt(async (ctx: StepContext) => {
                try {
                    const desc = await createDescription(ctx.state.refType, ctx.state.refUid, ctx.state.text);
                    await (ctx.interaction as ChatInputCommandInteraction).followUp({
                        content: `Description ${desc.uid} created for ${ctx.state.refType} ${ctx.state.refUid}.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    log.error('Error creating description', msg, 'createDescription');
                    await (ctx.interaction as ChatInputCommandInteraction).followUp({
                        content: `Error: ${msg}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            })
            .next()
            .start();
    });
}
