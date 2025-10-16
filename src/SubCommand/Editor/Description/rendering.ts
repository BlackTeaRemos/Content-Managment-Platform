import type { StepContext } from '../../../Common/Flow/Types.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { log } from '../../../Common/Log.js';

const RENDER_LOG_SOURCE = 'SubCommand/Editor/Description/rendering';

export type DescriptionStepContext = StepContext<any>;

function errorToMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
    return raw.length > 300 ? `${raw.slice(0, 297)}...` : raw;
}

export function resolveBaseInteraction(ctx: DescriptionStepContext): ChatInputCommandInteraction | undefined {
    const stored = ctx.recall?.('root', 'interaction');
    if (stored) return stored as ChatInputCommandInteraction;
    if (ctx.interaction && 'isChatInputCommand' in ctx.interaction && ctx.interaction.isChatInputCommand()) {
        return ctx.interaction as ChatInputCommandInteraction;
    }
    return undefined;
}

export async function renderDescription(
    ctx: DescriptionStepContext,
    options: { content?: string; embeds?: EmbedBuilder[] },
) {
    const base = resolveBaseInteraction(ctx);
    if (!base) return;
    const payload = { content: options.content ?? '', embeds: options.embeds ?? [] };
    try {
        if (!base.replied && !base.deferred) {
            await base.reply({ ...payload, flags: MessageFlags.Ephemeral });
        } else {
            await base.editReply(payload);
        }
    } catch (error) {
        const message = errorToMessage(error);
        log.error(`renderDescription failed: ${message}`, RENDER_LOG_SOURCE, 'renderDescription');
        const fallbackMessage = options.content
            ? `${options.content}\nPreview unavailable. Reason: ${message}`
            : `Preview unavailable. Reason: ${message}`;
        const fallback = { content: fallbackMessage, embeds: [] as EmbedBuilder[] };
        try {
            if (!base.replied && !base.deferred) {
                await base.reply({ ...fallback, flags: MessageFlags.Ephemeral });
            } else {
                await base.editReply(fallback);
            }
        } catch (secondaryError) {
            log.error(
                `renderDescription fallback failed: ${errorToMessage(secondaryError)}`,
                RENDER_LOG_SOURCE,
                'renderDescription',
            );
        }
    }
}

export async function renderControls(
    ctx: DescriptionStepContext,
    options: { content?: string; components?: ActionRowBuilder<StringSelectMenuBuilder>[] },
) {
    const base = resolveBaseInteraction(ctx);
    if (!base) return;
    const rootSnapshot = ctx.getStep?.('root');
    const storedId = (rootSnapshot?.data?.controlsMessageId as string | undefined) ?? undefined;
    const payload = { content: options.content ?? '', components: options.components ?? [] };
    if (storedId) {
        try {
            await base.webhook.editMessage(storedId, payload);
            return;
        } catch (error) {
            log.warning(
                `renderControls edit failed for message ${storedId}: ${errorToMessage(error)}`,
                RENDER_LOG_SOURCE,
                'renderControls',
            );
        }
    }
    try {
        const message = await base.followUp({ ...payload, flags: MessageFlags.Ephemeral });
        if (rootSnapshot) {
            (rootSnapshot.data as Record<string, unknown>).controlsMessageId = message.id;
        }
    } catch (error) {
        const message = errorToMessage(error);
        log.error(`renderControls failed: ${message}`, RENDER_LOG_SOURCE, 'renderControls');
        try {
            const fallback = await base.followUp({
                content: `Controls unavailable: ${message}`,
                flags: MessageFlags.Ephemeral,
            });
            if (rootSnapshot) {
                (rootSnapshot.data as Record<string, unknown>).controlsMessageId = fallback.id;
            }
        } catch (secondaryError) {
            log.error(
                `renderControls fallback failed: ${errorToMessage(secondaryError)}`,
                RENDER_LOG_SOURCE,
                'renderControls',
            );
        }
    }
}
