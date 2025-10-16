import { EventEmitter } from 'events';
import type { Client } from 'discord.js';
import { DiscordService } from '../Discord.js';

/**
 * Initializes the DiscordService and wires app-specific event handling.
 * Accepts a small setter callback to store the found `cmd-` channel id in the caller.
 */
export function initDiscord(options: {
    eventBus: EventEmitter;
    client: Client;
    config: any;
    setCmdChannelId?: (id: string | null) => void;
}) {
    const { eventBus, client, config, setCmdChannelId } = options;

    if (!config.discordToken || !config.discordGuildId || !config.discordCategoryId) {
        eventBus.emit(`output`, `Missing discordToken, discordGuildId, or discordCategoryId in config.`);
        return null;
    }

    const discord = new DiscordService(client, config.discordGuildId, config.discordCategoryId, config.discordToken);

    eventBus.on(`discord:ready`, async(_client, category, channels) => {
        eventBus.emit(`output`, `Connected to Discord API.`);
        eventBus.emit(`output`, `Category: ${category.name} (#${category.id})`);
        eventBus.emit(`output`, `Found ${channels.length} folder(s):`);

        for (const ch of channels) {
            eventBus.emit(`output`, `- #${ch.name} (${ch.id})`);

            try {
                const messages = await ch.messages.fetch({ limit: 5 });
                if (messages.size > 0) {
                    eventBus.emit(`output`, `  Last ${messages.size} messages:`);
                    messages.reverse().forEach((msg: any) => {
                        eventBus.emit(`output`, `    [${msg.author?.username}] ${msg.content}`);
                    });
                } else {
                    eventBus.emit(`output`, `  (No messages)`);
                }
            } catch(err) {
                eventBus.emit(`output`, `[DiscordInit]   Failed to fetch messages: ${err}`);
            }

            if (ch.name.startsWith(`cmd-`) && setCmdChannelId) {
                setCmdChannelId(ch.id);
            }
        }
    });

    eventBus.on(`discord:error`, err => {
        eventBus.emit(`output`, `Discord error: ${err}`);
    });

    eventBus.on(`discord:message:raw`, (msg: any) => {
        // Allow the caller to decide how to ignore messages from the bot itself; just re-emit for now.
        eventBus.emit(`output`, `[Discord] ${msg.author?.username}: ${msg.content}`);
    });

    return discord;
}
