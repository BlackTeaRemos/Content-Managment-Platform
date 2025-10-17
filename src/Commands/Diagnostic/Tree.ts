import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ApplicationCommandOptionType,
    MessageFlags,
} from 'discord.js';
import { createCommandContext } from '../../Common/ExecutionContextHelpers.js';
import { resolve } from '../../Common/permission/index.js';
import type { TokenSegmentInput } from '../../Common/permission/index.js';
import { requestPermissionFromAdmin } from '../../SubCommand/Permission/requestPermissionFromAdmin.js';

// Diagnostic: list commands built by loader

export const data = new SlashCommandBuilder()
    .setName(`diagnostic`)
    .setDescription(`Diagnostic commands`)
    .addSubcommand(sub => {
        return sub.setName(`tree`).setDescription(`List all registered commands`);
    });

export const permissionTokens: TokenSegmentInput[][] = [[`diagnostic`, `tree`]];

export async function execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.guild
        ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
        : null;
    const result = await resolve([[`diagnostic`, `tree`]], {
        context: { commandName: `diagnostic`, guildId: interaction.guildId ?? undefined, userId: interaction.user.id },
        member,
        skipApproval: false,
        requestApproval: async payload =>
            requestPermissionFromAdmin(interaction, { tokens: payload.tokens, reason: payload.reason }),
    });
    if (!result.success) {
        throw new Error(result.detail.reason ?? `Permission denied.`);
    }

    const ctx = createCommandContext(interaction);
    const sub = interaction.options.getSubcommand(true);
    if (sub === `tree`) {
        // Dynamically import loadedCommands to list builder data immediately
        const lines = await ctx.executionContext!.getOrCompute(`diagnostic:commands_tree`, async () => {
            const { commands } = await import(`../index.js`);

            return Object.values(commands).map((cmd: any) => {
                const json = cmd.data.toJSON();
                const parts: string[] = [`/${json.name}`];
                for (const opt of json.options ?? []) {
                    if (opt.type === ApplicationCommandOptionType.Subcommand) {
                        parts.push(`  - ${opt.name}`);
                    } else if (opt.type === ApplicationCommandOptionType.SubcommandGroup) {
                        parts.push(`- ${opt.name}`);
                        for (const subOpt of opt.options ?? []) {
                            parts.push(`    - ${subOpt.name}`);
                        }
                    }
                }
                return parts.join(`\n`);
            });
        });

        return ctx.reply({ content: lines.join(`\n\n`) || `No commands`, flags: MessageFlags.Ephemeral });
    }
}
