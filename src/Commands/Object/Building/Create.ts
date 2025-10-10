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
import { createFactory } from '../../../Flow/Object/Building/Create.js';
import { log } from '../../../Common/Log.js';
import { flowManager } from '../../../Common/Flow/Manager.js';
import { executeWithContext } from '../../../Common/ExecutionContextHelpers.js';
import type { ExecutionContext } from '../../../Domain/index.js';
import type { TokenSegmentInput } from '../../../Common/permission/index.js';

interface FlowState {
    type: string;
    orgUid: string;
    desc: string;
    uid?: string;
}

type StepContext = {
    state: FlowState;
    executionContext?: ExecutionContext;
    interaction: ChatInputCommandInteraction;
    userId: string;
};

export const data = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('Interactive create a new factory');

export const permissionTokens: TokenSegmentInput[][] = [['object', 'building', 'create']];

export async function execute(interaction: ChatInputCommandInteraction) {
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        // Interactive flow: collect type, organization UID, description, optional UID
        await flowManager
            .builder(
                interaction.user.id,
                interaction as any,
                { type: '', orgUid: '', desc: '', uid: '' },
                executionContext,
            )
            .step('factory_modal')
            .prompt(async (ctx: StepContext) => {
                const modal = new ModalBuilder()
                    .setCustomId('factory_modal')
                    .setTitle('New Factory')
                    .addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('type')
                                .setLabel('Factory Type')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true),
                        ),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('orgUid')
                                .setLabel('Organization UID')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true),
                        ),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('desc')
                                .setLabel('Factory Description')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true),
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
                    ctx.state.type = fields.getTextInputValue('type').trim();
                    ctx.state.orgUid = fields.getTextInputValue('orgUid').trim();
                    ctx.state.desc = fields.getTextInputValue('desc').trim();
                    const custom = fields.getTextInputValue('uid').trim();
                    ctx.state.uid = custom || undefined;
                    await interaction.deferUpdate();
                    return true;
                }
                return false;
            })
            .next()
            .step()
            .prompt(async (ctx: StepContext) => {
                try {
                    const factory = await createFactory(
                        ctx.state.type,
                        ctx.state.orgUid,
                        ctx.state.desc,
                        ctx.state.uid,
                    );
                    await (ctx.interaction as ChatInputCommandInteraction).followUp({
                        content: `Factory ${factory.uid} '${factory.type}' created under organization ${factory.organizationUid}.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    log.error('Error creating factory', msg, 'createFactory');
                    await (ctx.interaction as ChatInputCommandInteraction).followUp({
                        content: 'Error creating factory',
                        flags: MessageFlags.Ephemeral,
                    });
                }
            })
            .next()
            .start();
    });
}
