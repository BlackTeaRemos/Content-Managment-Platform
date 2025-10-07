import { log, LogLevel } from './Common/Log.js';
/**
 * Entry point for the application. Sets up and starts the main app logic, including initialization of services and event listeners.
 */
import { EventEmitter } from 'events';
import { MAIN_EVENT_BUS } from './Events/MainEventBus.js';
// ConfigService handles loading and validating config
import { ConfigService } from './Services/ConfigService.js';
import type { ValidatedConfig } from './Types/Config.js';
import { DiscordService } from './Discord.js';

import { GatewayIntentBits, REST, Routes, Client, MessageFlags, Events } from 'discord.js';
import { Session } from './Common/Session.js';
import type { Message } from 'discord.js';
import { onReady } from './Events/Ready.js';
import { onInteractionCreate } from './Events/InteractionCreate.js';
import { onMessageCreate } from './Events/MessageCreate.js';
import { commands as loadedCommands, commandsReady } from './Commands/index.js';
import { flowManager } from './Common/Flow/Manager.js';
/**
 * Logger instance, uses Sapphire Logger if available, otherwise falls back to console.log with info/error methods.
 * @type {{ info: (msg: string) => void, error: (msg: string|Error) => void }}
 */

// Supported log levels with numeric severity (lower is more verbose)
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

// Keys for log levels
type LogLevelKey = keyof typeof LOG_LEVELS;

/**
 * Application entry point for Discord Bot.
 */
export class DiscordApp {
    /**
     * Reference to DiscordService instance for sending messages, etc. [// DiscordService instance]
     */
    private _discordService: DiscordService | null = null;

    /**
     * Stores the id of the -cmd channel after discord:ready
     * @type {string | null} [// id of the -cmd channel]
     */
    private _cmdChannelId: string | null = null;

    /**
     * Event bus for communication between UI and backend.
     * @type {EventEmitter} [// Node.js event emitter for app-wide events]
     */
    public eventBus: EventEmitter;

    /** Service for loading and validating app config [// ConfigService instance] */
    private _configService: ConfigService;
    /** Discord.js client instance */
    private _client: Client | null = null;

    /** Sessions per guild, keyed by guild ID [// Map of sessions] */
    private _sessions: Map<string, Session<any>> = new Map();

    /**
     * Numeric severity for current logging level [// 0=debug,1=info,2=warn,3=error]
     */
    private _logLevel: number = LOG_LEVELS.info;

    /**
     * Indicates if the app is running [// boolean flag for main loop]
     */
    private _running: boolean = false;

    /**
     * Initializes the application, sets up event bus and starts IO loop.
     */
    public constructor(eventBus: EventEmitter = MAIN_EVENT_BUS) {
        this.eventBus = eventBus;
        this.__setupEventHandlers();

        this._configService = new ConfigService(this.eventBus);
        this.eventBus.emit(`output`, `Application starting...`);

        void this.__boot();

        /**
         * Stores the id of the -cmd channel after discord:ready
         * @type {string | null} [// id of the -cmd channel]
         */
        this._cmdChannelId = null;
    }

    /**
     * Boots the application: loads config, creates/logs in Discord.js client, then continues startup.
     * Ensures container.client is set before any DiscordService is created.
     * Wipes all application commands at startup using Sapphire's API (because why would you want to keep them?).
     * @private
     * @returns void
     * @example
     * // Called automatically on app start
     */
    private async __boot(): Promise<void> {
        try {
            const configPath = process.env.CONFIG_PATH || `./config/config.json`; // [// config file path]
            const config: ValidatedConfig = await this._configService.Load(configPath);

            const path = await import(`node:path`);
            const baseUserDirectory =
                process.env.NODE_ENV === `production`
                    ? path.join(process.cwd(), `cmp`)
                    : path.join(process.cwd(), `src`);

            // Create a Discord.js client
            const client = new Client({
                intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
            });

            // Store client
            this._client = client;

            // Add event listeners BEFORE login to avoid missing early events
            client.on('interactionCreate', onInteractionCreate);
            client.on('messageCreate', onMessageCreate);

            // Some environments use a legacy 'clientReady' event; others use Discord.js Events.ClientReady or 'ready'.
            // Guard to avoid double execution if more than one fires.
            let didReady = false;
            let readyTimeout: NodeJS.Timeout | undefined;
            const handleReady = async () => {
                if (didReady) return;
                didReady = true;
                if (readyTimeout) {
                    clearTimeout(readyTimeout);
                    readyTimeout = undefined;
                }
                this.eventBus.emit('output', '[Startup] Ready handler invoked. Beginning command registration...');
                // Ensure command discovery has completed before registration
                await commandsReady;
                // Clear existing commands before re-registration and then register in onReady
                try {
                    await this.__wipeAllApplicationCommands(client, config);

                    const commandData = Object.values(loadedCommands).map(cmd => cmd.data.toJSON());
                    this.eventBus.emit('output', `Prepared ${commandData.length} commands for registration.`);

                    // Register commands: use guild scope if configured, otherwise global
                    if (config.discordGuildId) {
                        try {
                            const registeredGuild = await client.application!.commands.set(
                                commandData,
                                config.discordGuildId,
                            );
                            this.eventBus.emit(
                                'output',
                                `Registered ${registeredGuild.size ?? commandData.length} guild commands to guild ${config.discordGuildId}.`,
                            );
                        } catch (err) {
                            this.eventBus.emit('output', `Guild command registration failed: ${String(err)}`);
                        }
                    } else {
                        try {
                            const registeredGlobal = await client.application!.commands.set(commandData);
                            this.eventBus.emit(
                                'output',
                                `Registered ${registeredGlobal.size ?? commandData.length} global commands.`,
                            );
                        } catch (err) {
                            this.eventBus.emit('output', `Global command registration failed: ${String(err)}`);
                        }
                    }
                } catch (err) {
                    this.eventBus.emit('output', `Command registration failed in ready handler: ${String(err)}`);
                }
            };

            client.once(Events.ClientReady, handleReady);

            await client.login(config.discordToken);

            flowManager.enableLogging({ level: LogLevel.Debug, source: 'Flow' });

            // Register error logging
            client.on(`error`, err => {
                log.error(`Client error: ${err}`, `App`);
            });

            // After login, emit logged-in
            this.eventBus.emit('output', `Discord.js client logged in.`);

            // Handle interactions
            client.on('interactionCreate', async interaction => {
                if (!interaction.isChatInputCommand()) return;
                const command = loadedCommands[interaction.commandName];
                if (!command) return;
                try {
                    // Execute command and let it handle replies
                    await command.execute(interaction);
                } catch (err) {
                    log.error(`Error executing command ${interaction.commandName}: ${err}`, 'App');
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'There was an error while executing this command!',
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                }
            });

            this.__initConfigAndDiscord(config);
        } catch (err) {
            this.eventBus.emit(`output`, `Fatal boot error: ${err}`);
            throw err;
        }
    }

    /**
     * Initializes Discord integration and log level after SapphireClient is ready and config is loaded.
     * @param config any - Loaded config object
     * @private
     */
    private __initConfigAndDiscord(config: any): void {
        // Apply log level from config
        if (config.logLevel && typeof config.logLevel === `string`) {
            const levelKey = config.logLevel as keyof typeof LOG_LEVELS;

            if (Object.prototype.hasOwnProperty.call(LOG_LEVELS, levelKey)) {
                this._logLevel = LOG_LEVELS[levelKey];
                this.eventBus.emit(`output`, `Log level set to '${levelKey}'`);
            }
        }

        this.eventBus.emit(`output`, `Loaded config, connecting to Discord...`);
        this.eventBus.on(`config:loaded`, cfg => {
            this.__initDiscord(cfg);
        });

        // If config already loaded, fire manually
        this.__initDiscord(config);
    }

    /**
     * Initializes DiscordService and wires up Discord events.
     * @param config any - Loaded config object
     * @private
     */
    private __initDiscord(config: any): void {
        // Validate config structure
        this.eventBus.emit(`output`, `[TRACE] Entered __initDiscord: about to validate config structure.`);

        if (!config.discordToken || !config.discordGuildId || !config.discordCategoryId) {
            this.eventBus.emit(
                `output`,
                `[TRACE] Config validation failed: missing discordToken, discordGuildId, or discordCategoryId.`,
            );
            this.eventBus.emit(`output`, `Missing discordToken, discordGuildId, or discordCategoryId in config.`);
            return;
        }

        this.eventBus.emit(`output`, `[TRACE] Config validated, about to create DiscordService instance.`);
        const discordClient = this._client!;
        const discord = new DiscordService(
            discordClient,
            config.discordGuildId,
            config.discordCategoryId,
            config.discordToken,
        );
        this.eventBus.emit(`output`, `[TRACE] DiscordService instance created with SapphireClient, storing reference.`);

        this._discordService = discord;
        this.eventBus.on(`discord:ready`, async (_client, category, channels) => {
            this.eventBus.emit(`output`, `Connected to Discord API.`);
            this.eventBus.emit(`output`, `Category: ${category.name} (#${category.id})`);
            this.eventBus.emit(`output`, `Found ${channels.length} folder(s):`);

            for (const ch of channels) {
                this.eventBus.emit(`output`, `- #${ch.name} (${ch.id})`);

                try {
                    const messages = await ch.messages.fetch({ limit: 5 });

                    if (messages.size > 0) {
                        this.eventBus.emit(`output`, `  Last ${messages.size} messages:`);
                        messages.reverse().forEach((msg: any) => {
                            this.eventBus.emit(`output`, `    [${msg.author?.username}] ${msg.content}`);
                        });
                    } else {
                        this.eventBus.emit(`output`, `  (No messages)`);
                    }
                } catch (err) {
                    this.eventBus.emit(`output`, `[App]   Failed to fetch messages: ${err}`);
                }

                if (ch.name.startsWith(`cmd-`)) {
                    this._cmdChannelId = ch.id;
                }
            }

            const guildId = category.guild.id;
        });
        this.eventBus.on(`discord:error`, err => {
            this.eventBus.emit(`output`, `Discord error: ${err}`);
        });

        this.eventBus.on(`discord:message:raw`, (msg: any) => {
            // Ignore messages sent by the bot itself
            if (
                this._discordService &&
                this._discordService.client &&
                msg.author &&
                msg.author.id === this._discordService.client.user?.id
            ) {
                return;
            }

            if (this._cmdChannelId && msg.channel.id === this._cmdChannelId) {
                if (msg.content && msg.content.trim().startsWith(`/`)) {
                    this.eventBus.emit(
                        `output`,
                        `Legacy "/"-prefixed commands are no longer supported. Use Discord slash commands instead.`,
                    );
                    return;
                }

                // No parsing for non-slash messages
            } else {
                this.eventBus.emit(`output`, `[Discord] ${msg.author?.username}: ${msg.content}`);
            }
        });
    }

    /**
     * Sets up core event handlers for IO and system events.
     * @private
     */
    private __setupEventHandlers(): void {
        this.eventBus.on(`input`, (data: string) => {
            this.__handleInput(data);
        });

        this.eventBus.on(`system:shutdown`, () => {
            this._running = false;
        });
    }

    /**
     * Handles input from the UI or console.
     * @param input string - The input string from the user, e.g. a command
     */
    private __handleInput(input: string): void {
        // For now, just echo the input. Replace with actual command handling.
        this.eventBus.emit(`output`, `Echo: ${input}`);
    }

    /**
     * Starts the main IO loop, reading from stdin and emitting events.
     * @returns void
     */
    public async Start(): Promise<void> {
        this._running = true;

        /**
         * Handles output events by logging to Sapphire logger if available, otherwise console.log.
         * @param msg string - The message to log
         */
        this.eventBus.on(`output`, (msg: string) => {
            // Only log info-level messages if current level allows
            if (this._logLevel <= LOG_LEVELS.info) {
                try {
                    log.info(msg, `App`);
                } catch (err) {
                    // Fallback to console if log fails
                    console.log(msg);
                }
            }
        });

        // Read from stdin asynchronously
        for await (const line of this.__readLines()) {
            this.eventBus.emit(`input`, line);

            if (!this._running) {
                break;
            }
        }
    }

    /**
     * Async generator to read lines from stdin.
     * @returns AsyncGenerator<string, void, unknown>
     * @example
     * for await (const line of this.__readLines()) { ... }
     */
    private async *__readLines(): AsyncGenerator<string, void, unknown> {
        const readline = await import(`readline`);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
        });

        for await (const line of rl) {
            yield line;
        }
    }

    /**
     * Wipes all application commands for global and guild scopes.
     * @param client Client - Discord.js client instance
     * @param config any - Loaded config containing discordGuildId
     * @private
     */
    private async __wipeAllApplicationCommands(client: Client, config: any): Promise<void> {
        const app = client.application!;
        // Remove all global commands
        await app.commands.set([]);
        // Remove all guild commands if guild ID configured
        if (config.discordGuildId) {
            await app.commands.set([], config.discordGuildId);
        }
    }
}
