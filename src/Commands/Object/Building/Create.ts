import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalSubmitInteraction,
} from 'discord.js';
import { createFactory } from '../../../Flow/Object/Building/Create.js';
import { log } from '../../../Common/Log.js';
import { flowManager } from '../../../Flow/FlowManager.js';

export const data = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('Interactive create a new factory');

export async function execute(interaction: ChatInputCommandInteraction) {
    // Interactive flow: collect type, organization UID, description, optional UID
    await flowManager
        .builder(interaction.user.id, interaction as any, { type: '', orgUid: '', desc: '', uid: '' })
        .step('factory_modal')
        .prompt(async ctx => {
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
        .onInteraction(async (ctx, interaction) => {
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
        .prompt(async ctx => {
            try {
                const factory = await createFactory(ctx.state.type, ctx.state.orgUid, ctx.state.desc, ctx.state.uid);
                await (ctx.interaction as ChatInputCommandInteraction).followUp({
                    content: `Factory ${factory.uid} '${factory.type}' created under organization ${factory.organizationUid}.`,
                    ephemeral: true,
                });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                log.error('Error creating factory', msg, 'createFactory');
                await (ctx.interaction as ChatInputCommandInteraction).followUp({
                    content: 'Error creating factory',
                    ephemeral: true,
                });
            }
        })
        .next()
        .start();
}
