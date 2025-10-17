import { MessageFlags } from 'discord.js';
import { log } from '../Common/Log.js';

/**
 * Factory for Discord interaction handler focused on chat input commands.
 * Commands remain responsible for their own permission evaluation.
 */
export function createInteractionHandler(options: { loadedCommands: Record<string, any> }) {
    const { loadedCommands } = options;

    return async function handleInteraction(interaction: any) {
        if (!interaction?.isChatInputCommand?.()) {
            return;
        }
        const command = loadedCommands[interaction.commandName];
        if (!command) {
            return;
        }

        try {
            await command.execute(interaction);
        } catch (err: any) {
            // Centralized error handler for permission denials and execution errors
            try {
                log.error(`Interaction handler error for /${interaction.commandName}: ${String(err)}`, `Boot`);
            } catch {}
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content:
                            typeof err?.message === `string` ? err.message : `Permission denied or execution error.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content:
                            typeof err?.message === `string` ? err.message : `Permission denied or execution error.`,
                    });
                }
            } catch {}
        }
    };
}
