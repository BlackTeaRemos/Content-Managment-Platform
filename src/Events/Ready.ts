/**
 * Handles the 'ready' event from Discord, triggered when the bot is fully initialized and connected.
 */
import { ChannelType, type Client } from 'discord.js';
import { log } from '../Common/Log.js';
import { commands, commandsReady } from '../Commands/index.js';

/**
 * Handles the ready event. Logs bot readiness, lists application and guild commands,
 * and ensures that a command text channel and a forum channel exist.
 * @param client {Client} - The Discord.js client instance
 * @returns {Promise<void>} - Resolves when setup is complete
 */
export async function onReady(client: Client): Promise<void> {
    log.info(`Bot is ready as ${client.user?.tag}`, `Ready`);

    // Diagnostic: list registered application commands (global and guild)
    try {
        const application = client.application;

        if (application?.commands) {
            // Fetch existing global commands
            const global = await application.commands.fetch();
            log.info(
                `Global commands (${global.size}): ${[...global.values()].map(c => {
                    return `/${c.name}`;
                }).join(`, `)}`,
                `Ready`,
            );
            // Ensure command loader has completed, then propagate loaded commands globally
            try {
                await commandsReady;
                const data = Object.values(commands).map(cmd => {
                    return cmd.data.toJSON();
                });
                const registered = await application.commands.set(data);
                log.info(`Registered ${registered.size} global commands`, `Ready`);
            } catch(err) {
                log.error(
                    `Failed to register global commands`,
                    err instanceof Error ? err.message : String(err),
                    `Ready`,
                );
            }
        }
    } catch(err) {
        log.warning(`Failed to fetch global commands: ${err instanceof Error ? err.message : String(err)}`, `Ready`);
    }
}
