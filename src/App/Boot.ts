import { EventEmitter } from 'events';
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { log } from '../Common/Log.js';
import {
    checkPermission,
    formatPermissionToken,
    grantForever,
    resolve as resolvePermission,
    type PermissionToken,
    type PermissionTokenInput,
    type TokenSegmentInput,
} from '../Common/permission/index.js';
import { requestPermissionFromAdmin } from '../SubCommand/Permission/PermissionUI.js';
import type { ConfigService } from '../Services/ConfigService.js';

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

    // Inline handler for executing chat input commands (kept here so command registration and execution stay together)
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const command = loadedCommands[interaction.commandName];
        if (!command) return;

        // Single try to guard permission checks and command execution
        try {
            const member = interaction.guild ? await interaction.guild.members.fetch(interaction.user.id) : null;

            // Resolve permission token templates for this command. Commands can export `permissionTokens` which
            // may be a string, string[], or async function returning those. If absent, default to a standard
            // template that maps to the command name.
            const cmdAny = command as any;
            let rawTemplates:
                | string
                | string[]
                | ((interaction: any) => Promise<string | string[] | undefined>)
                | undefined = cmdAny.permissionTokens ?? cmdAny.permissions ?? `command:{commandName}`;

            const templates: (string | TokenSegmentInput[])[] = [];
            if (typeof rawTemplates === 'function') {
                try {
                    const t = await rawTemplates(interaction);
                    if (!t) rawTemplates = `command:{commandName}`;
                    else rawTemplates = t;
                } catch {
                    rawTemplates = `command:{commandName}`;
                }
            }
            if (typeof rawTemplates === 'string') {
                templates.push(rawTemplates);
            } else if (Array.isArray(rawTemplates)) {
                for (const entry of rawTemplates) {
                    templates.push(entry as string | TokenSegmentInput[]);
                }
            }

            // Build resolver context
            const resolverCtx = {
                commandName: interaction.commandName,
                options: Object.fromEntries(interaction.options.data.map((o: any) => [o.name, o.value])),
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            };

            // Resolve templates into concrete tokens (most-specific first)
            const tokens: PermissionToken[] = [];
            const seenTokens = new Set<string>();
            for (const tmpl of templates) {
                const resolved = resolvePermission(tmpl, resolverCtx);
                for (const token of resolved) {
                    const display = formatPermissionToken(token);
                    if (seenTokens.has(display)) continue;
                    seenTokens.add(display);
                    tokens.push(token);
                }
            }

            const tokensToCheck: PermissionTokenInput[] = tokens.length ? tokens : [interaction.commandName];
            const perm = await checkPermission(undefined, member, tokensToCheck);

            // Not allowed immediately
            if (!perm.allowed) {
                if (perm.requiresApproval) {
                    // Keep the interaction alive while awaiting admin decision
                    try {
                        await interaction.deferReply({ ephemeral: true });
                    } catch {}

                    const decision = await requestPermissionFromAdmin(interaction, { tokens, reason: perm.reason });

                    if (decision === 'approve_forever' && interaction.guildId) {
                        // grant the most specific token
                        const grantToken: PermissionTokenInput =
                            tokens && tokens.length ? tokens[0] : interaction.commandName;
                        grantForever(interaction.guildId, interaction.user.id, grantToken);
                    }

                    if (decision === 'approve_forever' || decision === 'approve_once') {
                        // Admin approved — run the command
                        try {
                            await command.execute(interaction);
                        } catch (err) {
                            try {
                                log.error(`Error executing command ${interaction.commandName}: ${err}`, 'Boot');
                            } catch {}
                            if (!interaction.replied && !interaction.deferred) {
                                try {
                                    await interaction.reply({
                                        content: 'There was an error while executing this command!',
                                        flags: MessageFlags.Ephemeral,
                                    });
                                } catch {}
                            }
                        }
                        return;
                    }

                    // Denied or timed out
                    try {
                        await interaction.editReply({ content: `Permission denied or no admin response.` });
                    } catch {}
                    return;
                }

                // Explicitly forbidden
                try {
                    await interaction.reply({
                        content: `You are not allowed to run this command. ${perm.reason ? `Reason: ${perm.reason}` : ''}`,
                        flags: MessageFlags.Ephemeral,
                    });
                } catch {}
                return;
            }

            // Allowed — execute normally
            try {
                await command.execute(interaction);
            } catch (err) {
                try {
                    log.error(`Error executing command ${interaction.commandName}: ${err}`, 'Boot');
                } catch {}
                if (!interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply({
                            content: 'There was an error while executing this command!',
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch {}
                }
            }
        } catch (err) {
            try {
                log.error(`Permission check error for command ${interaction.commandName}: ${err}`, 'Boot');
            } catch {}
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Permission check failed.', flags: MessageFlags.Ephemeral });
                }
            } catch {}
        }
    });

    // ensure we return the client and config as before
    return { client, config };
}
