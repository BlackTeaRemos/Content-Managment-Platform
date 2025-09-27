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
import { log } from '../../../Common/Log.js';
import { createOrganization, generateUid } from '../../../Flow/Object/Organization/Create.js';
import { flowManager } from '../../../Flow/FlowManager.js';
import { executeWithContext } from '../../../Common/ExecutionContextHelpers.js';
import type { ExecutionContext } from '../../../Domain/index.js';

interface FlowState {
    name: string;
    friendly: string;
    uid?: string;
}

type StepContext = { state: FlowState; executionContext?: ExecutionContext; interaction: ChatInputCommandInteraction };

interface FlowState {
    name: string;
    friendly: string;
    uid?: string;
}

export const data = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('Interactive create a new organization');

export async function execute(interaction: ChatInputCommandInteraction) {
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        // Interactive flow: collect name, friendly name (optional), and UID (optional)
        await flowManager
            .builder(interaction.user.id, interaction as any, { name: '', friendly: '', uid: '' }, executionContext)
            .step('org_create_modal')
            .prompt(async (ctx: StepContext) => {
                const modal = new ModalBuilder()
                    .setCustomId('org_create_modal')
                    .setTitle('New Organization')
                    .addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('name')
                                .setLabel('Organization Name')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true),
                        ),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('friendly')
                                .setLabel('Friendly Name')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(false),
                        ),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('uid')
                                .setLabel('Custom UID')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(false),
                        ),
                    );
                await (ctx.interaction as ChatInputCommandInteraction).showModal(modal);
            })
            .onInteraction(async (ctx: StepContext, interaction: any) => {
                if (interaction.isModalSubmit()) {
                    const fields = interaction.fields;
                    ctx.state.name = fields.getTextInputValue('name').trim();
                    ctx.state.friendly = fields.getTextInputValue('friendly').trim() || ctx.state.name;
                    ctx.state.uid = fields.getTextInputValue('uid').trim() || undefined;
                    await interaction.deferUpdate();
                    return true;
                }
                return false;
            })
            .next()
            .step()
            .prompt(async (ctx: StepContext) => {
                try {
                    const org = await createOrganization(
                        ctx.state.name!,
                        ctx.state.friendly || ctx.state.name!,
                        ctx.state.uid,
                    );
                    await (ctx.interaction as ChatInputCommandInteraction).followUp({
                        content: `Organization ${org.uid} '${org.name}' created.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (error) {
                    log.error(
                        'Error creating organization',
                        error instanceof Error ? error.message : String(error),
                        'createOrganization',
                    );
                    await (ctx.interaction as ChatInputCommandInteraction).followUp({
                        content: 'Error creating organization',
                        flags: MessageFlags.Ephemeral,
                    });
                }
            })
            .next()
            .start();
    });
}
