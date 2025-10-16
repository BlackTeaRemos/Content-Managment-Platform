/**
 * DiscordClientRegistry provides a very small global registry for the active Discord.js Client.
 * This is required so that late‑bound services (e.g., DiscordForumStorage) can obtain a reference
 * without every call site manually threading the client instance through constructor stacks.
 */
import { Client } from 'discord.js';
import { log } from '../Common/Log.js';

let _client: Client | null = null; // currently registered client instance

/**
 * Registers the active Discord client instance.
 * @param client Client – discord.js client that has (or soon will) login.
 */
export function RegisterDiscordClient(client: Client): void {
    // public API – simple enough no JSDoc extras
    if (_client && _client !== client) {
        log.warning(
            `RegisterDiscordClient called multiple times – overwriting previous client reference`,
            `DiscordClientRegistry`,
        );
    }
    _client = client;
}

/**
 * Returns the registered Discord client or null if not yet set.
 * @returns Client | null – active client instance.
 */
export function GetDiscordClient(): Client | null {
    // public API
    return _client;
}
export const registerDiscordClient = RegisterDiscordClient;
