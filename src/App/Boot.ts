import { EventEmitter } from 'events';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { log } from '../Common/Log.js';
import type { ConfigService } from '../Services/ConfigService.js';
import { createInteractionHandler } from './InteractionHandler.js';

/**
 * Boot helper: loads config, creates and logs-in a Discord client, and registers application commands.
 * This extracts the large boot logic from the main application class.
 */
export async function bootDiscordClient(options: {
    eventBus: EventEmitter;
    configService: ConfigService;
    loadedCommands: Record<string, any>;
    commandsReady: Promise<void>;
    onInteractionCreate?: (any: any) => void;
    onMessageCreate?: (any: any) => void;
}): Promise<{ client: Client; config: any }> {
    const { eventBus, configService, loadedCommands, commandsReady, onInteractionCreate, onMessageCreate } = options;

    const configPath = process.env.CONFIG_PATH || `./config/config.json`;
    const config = await configService.Load(configPath);

    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });

    // Wire lightweight handlers provided by the caller
    if (onInteractionCreate) client.on('interactionCreate', onInteractionCreate);
    if (onMessageCreate) client.on('messageCreate', onMessageCreate);

    // Error logging
    client.on('error', err => {
        try {
            log.error(`Client error: ${err}`, 'Boot');
        } catch {
            // swallow
        }
        eventBus.emit('output', `Discord client error: ${String(err)}`);
    });

    // Command registration happens once the client is ready
    let didReady = false;
    const handleReady = async () => {
        if (didReady) return;
        didReady = true;
        eventBus.emit('output', '[Boot] Client ready, registering commands...');

        await commandsReady;

        try {
            // Wipe all commands first (global)
            await client.application!.commands.set([]);

            // Prepare command bodies
            const commandData = Object.values(loadedCommands).map((cmd: any) => cmd.data.toJSON());

            if (config.discordGuildId) {
                try {
                    const registeredGuild = await client.application!.commands.set(commandData, config.discordGuildId);
                    eventBus.emit(
                        'output',
                        `Registered ${registeredGuild.size ?? commandData.length} guild commands to guild ${config.discordGuildId}.`,
                    );
                } catch (err) {
                    eventBus.emit('output', `Guild command registration failed: ${String(err)}`);
                }
            } else {
                try {
                    const registeredGlobal = await client.application!.commands.set(commandData);
                    eventBus.emit(
                        'output',
                        `Registered ${registeredGlobal.size ?? commandData.length} global commands.`,
                    );
                } catch (err) {
                    eventBus.emit('output', `Global command registration failed: ${String(err)}`);
                }
            }
        } catch (err) {
            eventBus.emit('output', `Command registration failed in ready handler: ${String(err)}`);
        }
    };

    client.once(Events.ClientReady, handleReady);

    await client.login(config.discordToken);

    eventBus.emit('output', `Discord.js client logged in.`);

    // Extracted interaction handler for clarity
    const interactionHandler = createInteractionHandler({ loadedCommands });
    client.on('interactionCreate', interactionHandler);

    // ensure we return the client and config as before
    return { client, config };
}
