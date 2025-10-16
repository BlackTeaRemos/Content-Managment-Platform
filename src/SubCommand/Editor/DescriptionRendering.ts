import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { log } from '../../Common/Log.js';

const RENDER_LOG_SOURCE = 'SubCommand/Editor/DescriptionRendering';

function errorToMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
    return raw.length > 300 ? `${raw.slice(0, 297)}...` : raw;
}

export async function renderDescriptionToInteraction(
    interaction: ChatInputCommandInteraction,
    options: { content?: string; embeds?: EmbedBuilder[] },
) {
    const payload = { content: options.content ?? '', embeds: options.embeds ?? [] };
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.editReply(payload);
        }
    } catch (error) {
        const message = errorToMessage(error);
        log.error(`renderDescription failed: ${message}`, RENDER_LOG_SOURCE, 'renderDescriptionToInteraction');
        const fallbackMessage = options.content
            ? `${options.content}\nPreview unavailable. Reason: ${message}`
            : `Preview unavailable. Reason: ${message}`;
        const fallback = { content: fallbackMessage, embeds: [] as EmbedBuilder[] };
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ ...fallback, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.editReply(fallback);
            }
        } catch (secondaryError) {
            log.error(
                `renderDescription fallback failed: ${errorToMessage(secondaryError)}`,
                RENDER_LOG_SOURCE,
                'renderDescriptionToInteraction',
            );
        }
    }
}

export async function renderControlsToInteraction(
    interaction: ChatInputCommandInteraction,
    options: { content?: string; components?: ActionRowBuilder<StringSelectMenuBuilder>[] },
) {
    const payload = { content: options.content ?? '', components: options.components ?? [] };
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
            return;
        }
        // Use followUp to keep a controls message separate from the main reply
        const message = await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
        return message.id;
    } catch (error) {
        const message = errorToMessage(error);
        log.error(`renderControls failed: ${message}`, RENDER_LOG_SOURCE, 'renderControlsToInteraction');
        try {
            const fallback = await interaction.followUp({
                content: `Controls unavailable: ${message}`,
                flags: MessageFlags.Ephemeral,
            });
            return fallback.id;
        } catch (secondaryError) {
            log.error(
                `renderControls fallback failed: ${errorToMessage(secondaryError)}`,
                RENDER_LOG_SOURCE,
                'renderControlsToInteraction',
            );
        }
    }
}
