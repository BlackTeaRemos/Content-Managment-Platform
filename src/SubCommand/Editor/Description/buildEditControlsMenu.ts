import { StringSelectMenuBuilder } from 'discord.js';

/**
 * Build the select menu used to control editing (mode, confirm, reset, cancel).
 * @param state any Flow state to determine current mode
 * @returns StringSelectMenuBuilder The ready-to-use select menu
 */
export function buildEditControlsMenu(state: any): StringSelectMenuBuilder {
    const mode = state.editMode ?? `replace`;
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`desc_edit_session`)
        .setPlaceholder(`Editing controls`)
        .addOptions([
            { label: mode === `replace` ? `Mode: Replace (current)` : `Switch to replace`, value: `mode_replace` },
            { label: mode === `append` ? `Mode: Append (current)` : `Switch to append`, value: `mode_append` },
            { label: mode === `remove` ? `Mode: Remove (current)` : `Switch to remove`, value: `mode_remove` },
            { label: `Confirm changes`, value: `confirm` },
            { label: `Reset collected inputs`, value: `reset` },
            { label: `Cancel editing`, value: `cancel` },
        ] as any);
    return menu;
}
