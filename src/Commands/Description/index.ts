import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { executeWithContext } from '../../Common/ExecutionContextHelpers.js';
import { startInteractiveDescriptionEditor } from '../../SubCommand/Editor/DescriptionEditor.js';
import { resolve } from '../../Common/permission/index.js';
import type { TokenSegmentInput } from '../../Common/permission/index.js';
import { requestPermissionFromAdmin } from '../../SubCommand/Permission/requestPermissionFromAdmin.js';

export const data = new SlashCommandBuilder()
    .setName(`description`)
    .setDescription(`Work with descriptions`)
    .addSubcommand(s => {
        return s.setName(`create`).setDescription(`Create or edit description for an object`);
    });

export const permissionTokens: TokenSegmentInput[][] = [[`description`]];

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== `create`) {
        await interaction.reply({ content: `Unsupported subcommand`, flags: MessageFlags.Ephemeral });
        return;
    }

    const member = interaction.guild
        ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
        : null;
    const result = await resolve([[`description`]], {
        context: { commandName: `description`, guildId: interaction.guildId ?? undefined, userId: interaction.user.id },
        member,
        skipApproval: false,
        requestApproval: async payload =>
            requestPermissionFromAdmin(interaction, { tokens: payload.tokens, reason: payload.reason }),
    });
    if (!result.success) {
        throw new Error(result.detail.reason ?? `Permission denied.`);
    }

    await executeWithContext(interaction, async (fm, executionContext) => {
        // Delegate interaction handling to the Editor subcommand which owns the UI flow.
        await startInteractiveDescriptionEditor(fm, interaction, executionContext);
    });
}
