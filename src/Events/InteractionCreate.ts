/**
 * Handles the 'interactionCreate' event from Discord, processing all interactions (slash commands, buttons, etc).
 */
import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { log } from '../Common/Log.js';
import { flowManager } from '../Flow/FlowManager.js';

/**
 * Handles the interactionCreate event.
 * @param interaction {Interaction} - The Discord.js interaction instance
 * @returns {Promise<void>} - Resolves when handling is complete
 */
export async function onInteractionCreate(interaction: Interaction): Promise<void> {
    // Log the interaction
    log.info(
        `Interaction received: type=${interaction.type}, id=${interaction.id}, user=${interaction.user?.tag}`,
        'Interaction',
    );
    // Handle game creation flow interactions
    // Handle button interactions
    if (interaction.isButton()) {
        const { customId, user } = interaction;
        const { gameCreationStates } = await import('../Flow/Object/Game/Flow.js');
        if (customId === 'game_create_cancel') {
            gameCreationStates.delete(user.id);
            await interaction.update({ content: 'Game creation cancelled.', embeds: [], components: [] });
            return;
        }
        if (customId === 'game_create_setname') {
            const modal = new ModalBuilder()
                .setCustomId('game_create_name_modal')
                .setTitle('Set Game Name')
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('gameName')
                            .setLabel('Game Name')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true),
                    ),
                );
            await interaction.showModal(modal);
            return;
        }
    }
    // Handle modal submit for game name
    if (interaction.isModalSubmit() && interaction.customId === 'game_create_name_modal') {
        const gameName = interaction.fields.getTextInputValue('gameName');
        const { gameCreationStates } = await import('../Flow/Object/Game/Flow.js');
        const state = gameCreationStates.get(interaction.user.id);
        if (state) {
            state.gameName = gameName;
            await interaction.reply({
                content: 'Game name set. Please send the game image as an attachment in your next message.',
                ephemeral: true,
            });
        }
    }
    // Delegate any other component interactions (buttons, modals, select menus) to interactive flow manager
    try {
        await flowManager.onInteraction(interaction);
    } catch {
        // ignore errors from flow manager
    }
}
