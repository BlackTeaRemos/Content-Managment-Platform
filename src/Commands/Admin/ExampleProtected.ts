import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { createCommandContext } from '../../Common/ExecutionContextHelpers.js';
import { CommandModule, CommandModuleMeta } from '../../Domain/Command.js';

export const meta: CommandModuleMeta = {
    id: 'example-protected',
    description: 'Example command demonstrating new permission system',
    permissions: {
        requiredTags: ['example.read', 'example.execute'],
        // Legacy support still works
        allowDM: false
    },
    tags: ['example', 'demo', 'permission']
};

export const data = new SlashCommandBuilder()
    .setName('example')
    .setDescription('Example command with permission tags')
    .addSubcommand(sub => 
        sub
            .setName('read')
            .setDescription('Read example data (requires example.read tag)')
    )
    .addSubcommand(sub => 
        sub
            .setName('write')
            .setDescription('Write example data (requires example.write tag)')
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);
    const subcommand = interaction.options.getSubcommand();

    // This command will be automatically checked for permission tags by CommandRegistry
    // If the user doesn't have the required tags, they'll get a permission denied message
    // or an ephemeral permission request

    switch (subcommand) {
        case 'read':
            return ctx.reply({
                content: '📖 Reading example data... You have the required permissions!',
                flags: MessageFlags.Ephemeral
            });
            
        case 'write':
            // This subcommand would need additional permission checking if it requires different tags
            // For now, it uses the same permissions as defined in meta
            return ctx.reply({
                content: '✏️ Writing example data... You have the required permissions!',
                flags: MessageFlags.Ephemeral
            });
            
        default:
            return ctx.reply({
                content: '❌ Unknown subcommand.',
                flags: MessageFlags.Ephemeral
            });
    }
}