import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ApplicationCommandOptionType,
    MessageFlags,
} from 'discord.js';
// Diagnostic: list commands built by loader

export const data = new SlashCommandBuilder()
    .setName('diagnostic')
    .setDescription('Diagnostic commands')
    .addSubcommand(sub => sub.setName('tree').setDescription('List all registered commands'));

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    if (sub === 'tree') {
        // Dynamically import loadedCommands to list builder data immediately
        const { commands } = await import('../index.js');

        const lines = Object.values(commands).map((cmd: any) => {
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
            return parts.join('\n');
        });
        return interaction.reply({ content: lines.join('\n\n') || 'No commands', flags: MessageFlags.Ephemeral });
    }
}
