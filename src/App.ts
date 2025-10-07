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
import { bootDiscordClient } from './App/Boot.js';
import { initDiscord } from './App/DiscordInit.js';

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
            const { client, config } = await bootDiscordClient({
                eventBus: this.eventBus,
                configService: this._configService,
                loadedCommands,
                commandsReady,
                onInteractionCreate,
                onMessageCreate,
            });

            this._client = client;

            // Initialize the higher-level DiscordService and wire additional listeners
            const discord = initDiscord({
                eventBus: this.eventBus,
                client: client,
                config,
                setCmdChannelId: id => {
                    this._cmdChannelId = id;
                },
            });

            if (discord) {
                this._discordService = discord;
            }

            // Keep original lightweight output after login
            this.eventBus.emit('output', 'Boot completed.');
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

    // Keep a thin compatibility wrapper that delegates to the new init module when present
    private __initDiscord(config: any): void {
        this.eventBus.emit(`output`, `[TRACE] Entered __initDiscord (delegating to DiscordInit)`);

        if (!config || !this._client) {
            this.eventBus.emit(`output`, `[TRACE] __initDiscord skipped: missing config or client.`);
            return;
        }

        // If the DiscordService has already been created (e.g. during boot), skip creating a new one.
        if (this._discordService) {
            this.eventBus.emit(`output`, `[TRACE] DiscordService already initialized.`);
            return;
        }

        const discord = initDiscord({
            eventBus: this.eventBus,
            client: this._client,
            config,
            setCmdChannelId: id => (this._cmdChannelId = id),
        });

        if (discord) this._discordService = discord;
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
