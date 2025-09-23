import { log } from './Common/Log.js';
import {
    Events,
    TextChannel,
    CategoryChannel,
    ChannelType,
    Guild,
    Message,
    Client,
    AttachmentBuilder,
} from 'discord.js';
import { MAIN_EVENT_BUS } from './Events/MainEventBus.js';
import { RegisterDiscordClient } from './Services/DiscordClientRegistry.js';

/**
 * Discord service for managing bot connections and channel operations.
 * Handles Discord client setup, guild management, and category/channel organization.
 * Provides VPI configuration loading from dedicated Discord channels.
 * Emits 'discord:ready', 'discord:error', 'discord:message:raw' events on MAIN_EVENT_BUS.
 * @example
 * const discordService = new DiscordService(client, '123456789', '987654321');
 */
export class DiscordService {
    public readonly client: Client; // Discord.js client instance
    private _category: CategoryChannel | null = null; // The root category channel for all object storage channels
    private _channels: TextChannel[] = []; // The text channels in the category
    private _guild: Guild | null = null; // The Discord server (guild) the bot is connected to

    /**
     * Creates a new DiscordService instance and configures Discord client event handlers.
     * Sets up comprehensive logging for all Discord events and initializes guild/category discovery.
     * Registers global Discord client for storage backends and wraps channel send methods for logging.
     * @param client - The Discord.js client instance (SapphireClient or Client)
     * @param guildId - Discord server (guild) ID to connect to
     * @param categoryId - Category channel ID to use as root for object storage
     * @param discordToken - Discord bot token from configuration
     * @example
     * const discordService = new DiscordService(client, '123456789012345678', '876543210987654321', 'bot-token');
     */
    constructor(client: Client, guildId: string, categoryId: string, discordToken: string) {
        this.client = client;
        this.client.on('raw', (packet: any) => {
            // packet.t is the event name, packet.d is the data
            // log.debug(`Raw event ${packet.t}: ${JSON.stringify(packet.d)}`, 'DiscordService');
        });
        // Listen for all error events
        this.client.on('error', err => {
            log.error(
                `Client error event: ${err instanceof Error ? err.stack || err.message : String(err)}`,
                'DiscordService',
            );
        });

        this.client.on('shardError', err => {
            log.error(
                `Shard error event: ${err instanceof Error ? err.stack || err.message : String(err)}`,
                'DiscordService',
            );
        });

        this.client.on('debug', info => {
            log.debug(`Debug: ${info}`, 'DiscordService');
        });

        this.client.on('warn', info => {
            log.warning(`Warning: ${info}`, 'DiscordService');
        });

        this.client.once(Events.ClientReady, async () => {
            try {
                // Fetch the guild (server) and log it
                const guild = await this.client.guilds.fetch(guildId);
                this._guild = guild;
                log.info(`Connected to guild: ${guild.name} (${guild.id})`, 'DiscordService');

                // Fetch the category and log it
                const category = await this.client.channels.fetch(categoryId);

                if (!category || category.type !== ChannelType.GuildCategory) {
                    throw new Error('Category not found or not a category');
                }
                this._category = category as CategoryChannel;
                log.info(`Using category: ${category.name} (${category.id})`, 'DiscordService');

                // Fetch all text channels in the category
                const allChannels = (category as CategoryChannel).children.cache.filter(
                    (ch: any) => ch.type === ChannelType.GuildText,
                );
                this._channels = Array.from(allChannels.values()) as TextChannel[];
                log.info(`Found ${this._channels.length} text channel(s) in category.`, 'DiscordService');
                this._channels.forEach(ch => log.info(`Channel: ${ch.name} (${ch.id})`, 'DiscordService'));

                // Check for any cmd- channel, create one if missing
                let cmdChannel = this._channels.find(ch => ch.name.startsWith('cmd-'));

                if (!cmdChannel) {
                    const uniqueName = `cmd-bot`;
                    log.info(`No cmd- channel found, creating '${uniqueName}'...`, 'DiscordService');

                    try {
                        cmdChannel = await (category as CategoryChannel).guild.channels.create({
                            name: uniqueName,
                            type: ChannelType.GuildText,
                            parent: category.id,
                        });
                        this._channels.push(cmdChannel);
                        log.info(`'${uniqueName}' channel created.`, 'DiscordService');
                    } catch (err) {
                        log.error(
                            `Failed to create cmd- channel: ${err instanceof Error ? err.stack || err.message : String(err)}`,
                            'DiscordService',
                        );
                    }
                }

                MAIN_EVENT_BUS.emit('discord:ready', this.client, this._category, this._channels);
            } catch (err) {
                log.error(
                    `Error during ready event: ${err instanceof Error ? err.stack || err.message : String(err)}`,
                    'DiscordService',
                );
                MAIN_EVENT_BUS.emit('discord:error', err);
            }
        });

        this.client.on(Events.MessageCreate, msg => {
            // Extensive logging for every message received, regardless of channel
            const isSelf = msg.author.id === this.client.user?.id;
            const inCategory = this._channels.some(ch => ch.id === msg.channel.id);
            // Compose a detailed log message
            const logLines = [
                `\n--- MESSAGE RECEIVED ---`,
                `Channel: #${(msg.channel as TextChannel).name} (${msg.channel.id})`,
                `Author: ${msg.author.username} (${msg.author.id})${isSelf ? ' (self)' : ''}`,
                `Content: ${msg.content}`,
                `Created at: ${msg.createdAt.toISOString()} | Edited: ${msg.editedAt ? msg.editedAt.toISOString() : 'never'}`,
                `Attachments: ${
                    msg.attachments.size > 0
                        ? Array.from(msg.attachments.values())
                              .map(a => a.url)
                              .join(', ')
                        : 'none'
                }`,
                `Embeds: ${msg.embeds.length}`,
                `Mentions: ${msg.mentions.users.size} user(s), ${msg.mentions.roles.size} role(s)`,
                `Message type: ${msg.type}`,
                `Webhook: ${msg.webhookId ? 'yes' : 'no'}`,
                `In expected category: ${inCategory ? 'yes' : 'NOPE'}`,
            ];

            if (!inCategory) {
                logLines.push('WARNING: Message is NOT in the expected category. Are you lost?');
            }

            if (!msg.content && msg.attachments.size === 0 && msg.embeds.length === 0) {
                logLines.push('...An empty message. Inspiring.');
            }
            log.info(logLines.join('\n'), 'DiscordService');

            // Emit raw message event for all messages in the category
            if (inCategory) {
                MAIN_EVENT_BUS.emit('discord:message:raw', msg);
            }
        });

        // Wrap send for all text channels to log when the bot sends a message
        const _this = this;
        const origSend = TextChannel.prototype.send;
        TextChannel.prototype.send = async function (
            ...args: [string | import('discord.js').MessagePayload | import('discord.js').MessageCreateOptions]
        ) {
            const content = args[0];
            // Log the outgoing message
            log.info(
                `Bot sending message to #${this.name} (${this.id}): ${typeof content === 'string' ? content : '[embed or object]'}`,
                'DiscordService',
            );

            try {
                const result = await origSend.apply(this, [content]);
                return result;
            } catch (err) {
                log.error(
                    `Error sending message: ${err instanceof Error ? err.stack || err.message : String(err)}`,
                    'DiscordService',
                );
                throw err;
            }
        };

        log.info('Attempting to login...', 'DiscordService');

        try {
            RegisterDiscordClient(this.client);
        } catch {
            /* ignore */
        }
    }

    /**
     * Returns the Discord.js client instance for direct API access.
     * @returns The Discord.js client instance
     * @example
     * const client = discordService.GetClient();
     */
    public GetClient(): Client {
        return this.client;
    }

    /**
     * Returns the Discord guild (server) instance if available.
     * Will be null until the ClientReady event has been processed.
     * @returns Guild instance or null if not yet loaded
     * @example
     * const guild = discordService.GetGuild();
     * if (guild) console.log(`Connected to ${guild.name}`);
     */
    public GetGuild(): Guild | null {
        return this._guild;
    }

    /**
     * Returns the root category channel instance if available.
     * Will be null until the ClientReady event has been processed.
     * @returns CategoryChannel instance or null if not yet loaded
     * @example
     * const category = discordService.GetCategory();
     */
    public GetCategory(): CategoryChannel | null {
        return this._category;
    }

    /**
     * Returns all text channels found in the configured category.
     * Empty array until the ClientReady event has been processed.
     * @returns Array of TextChannel instances in the category
     * @example
     * const channels = discordService.GetChannels();
     * channels.forEach(ch => console.log(`Channel: ${ch.name}`));
     */
    public GetChannels(): TextChannel[] {
        return this._channels;
    }
}
