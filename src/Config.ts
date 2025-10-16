/**
 * Loads and provides access to application configuration settings from config files or environment variables.
 * Handles configuration validation, parsing, and event emission for configuration state changes.
 */

import { readConfigFile } from './Common/ConfigReader.js';
import { MAIN_EVENT_BUS } from './Events/MainEventBus.js';

/**
 * Application configuration interface defining all required and optional settings.
 * @interface AppConfig
 * @property {string} discordToken - Discord bot token for authentication
 * @property {string} discordChannel - Discord channel ID for file storage operations
 * @property {string} dbPath - Path to SQLite database file for persistent storage
 * @property {number} [maxFileSize] - Maximum file size in bytes (optional, defaults to Discord limit)
 * @property {('debug'|'info'|'warn'|'error')} [logLevel] - Logging verbosity level (optional, defaults to 'info')
 */
export interface AppConfig {
    discordToken: string; // Discord bot authentication token
    discordChannel: string; // Discord channel ID for storage operations
    dbPath: string; // SQLite database file path
    maxFileSize?: number; // optional maximum file size limit
    logLevel?: `debug` | `info` | `warn` | `error`; // optional logging level
    /** Optional Neo4j configuration for graph repository integration. */
    neo4j?: {
        uri: string; // e.g., bolt://localhost:7687
        username: string; // Neo4j username
        password: string; // Neo4j password
        database?: string; // optional database name
    };
}

/**
 * Loads and parses the global configuration file with validation and event emission.
 * Supports JSON and YAML configuration formats with comprehensive error handling.
 * @param configPath string - Path to configuration file (JSON or YAML format)
 * @returns Promise<AppConfig> - Parsed and validated configuration object
 * @example
 * const config = await LoadConfig('./config/app.json');
 * console.log('Discord token:', config.discordToken);
 */
export async function LoadConfig(configPath: string): Promise<AppConfig> {
    try {
        const parsedConfig = await readConfigFile(configPath); // parsed configuration data
        const envNeo4jUri = process.env.NEO4J_URI;
        const envNeo4jUser = process.env.NEO4J_USER;
        const envNeo4jPassword = process.env.NEO4J_PASSWORD;
        if (envNeo4jUri || envNeo4jUser || envNeo4jPassword) {
            (parsedConfig as any).neo4j = (parsedConfig as any).neo4j || {};
            if (envNeo4jUri) {
                (parsedConfig as any).neo4j.uri = envNeo4jUri;
            }
            if (envNeo4jUser) {
                (parsedConfig as any).neo4j.username = envNeo4jUser;
            }
            if (envNeo4jPassword) {
                (parsedConfig as any).neo4j.password = envNeo4jPassword;
            }
        }
        MAIN_EVENT_BUS.emit(`config:loaded`, parsedConfig);
        return parsedConfig as AppConfig;
    } catch(configError) {
        MAIN_EVENT_BUS.emit(`config:error`, configError);
        throw configError;
    }
}
