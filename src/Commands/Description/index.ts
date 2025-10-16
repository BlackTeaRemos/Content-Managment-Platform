import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { executeWithContext } from '../../Common/ExecutionContextHelpers.js';
import { startInteractiveDescriptionEditor } from '../../SubCommand/Editor/DescriptionEditor.js';
import type { TokenSegmentInput } from '../../Common/permission/index.js';

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

    await executeWithContext(interaction, async(fm, executionContext) => {
        // Delegate interaction handling to the Editor subcommand which owns the UI flow.
        await startInteractiveDescriptionEditor(fm, interaction, executionContext);
    });
}
