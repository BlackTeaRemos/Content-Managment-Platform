import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import type { TokenSegmentInput } from '../../Common/permission/index.js';
import { grantResolverApproval } from '../../Flow/permission/GrantResolverApproval.js';

/**
 * Slash command definition for managing permission resolvers.
 */
export const data = new SlashCommandBuilder()
    .setName(`permission`)
    .setDescription(`Manage permission resolvers`)
    .addSubcommand(sub => {
        return sub
            .setName(`resolver`)
            .setDescription(`Designate a resolver for manual permission approvals`)
            .addUserOption(option => {
                return option
                    .setName(`user`)
                    .setDescription(`User who should receive resolver privileges`)
                    .setRequired(true);
            });
    });

/**
 * Permission tokens for the permission command (empty to bypass command-level permissions).
 * @returns Promise<TokenSegmentInput[][]> Empty token list (example: []).
 * @example
 * const templates = await permissionTokens();
 */
export const permissionTokens = async (): Promise<TokenSegmentInput[][]> => {
    return [];
};

/**
 * Execute the permission resolver command by validating ownership and persisting resolver metadata.
 * @param interaction ChatInputCommandInteraction Incoming command interaction (example: slash command execution).
 * @returns Promise<void> Resolves when the interaction reply is sent (example: returns void on success).
 * @example
 * await execute(interaction);
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand !== `resolver`) {
        await interaction.reply({
            content: `Unknown subcommand.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (!interaction.guild || !interaction.guildId) {
        await interaction.reply({
            content: `This command can only be used inside a guild.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const ownerId = interaction.guild.ownerId;
    if (interaction.user.id !== ownerId) {
        await interaction.reply({
            content: `Only the server owner can assign resolver permissions.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const targetUser = interaction.options.getUser(`user`, true);
    await interaction.deferReply({ ephemeral: true });

    try {
        const result = await grantResolverApproval({
            serverId: interaction.guildId,
            discordUserId: targetUser.id,
        });

        await interaction.editReply({
            content: `Resolver permissions stored for ${targetUser.tag}. Tokens: ${result.tokens.join(`, `)}.`,
        });
    } catch (error) {
        await interaction.editReply({
            content: `Failed to store resolver permissions: ${String(error)}`,
        });
    }
}
