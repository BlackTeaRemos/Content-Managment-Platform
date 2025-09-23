/**
 * Loads and provides access to application configuration settings from config files or environment variables.
 * This is a generic config reader, not tied to the application event bus or any specific runtime.
 */
import { readFile } from 'fs/promises';

/**
 * @typedef {object} AppConfig
 * @property {string} discordToken - Discord bot token [// required for Discord integration]
 * @property {string} discordChannel - Discord channel ID for file storage [// required]
 * @property {string} dbPath - Path to SQLite database file [// required]
 * @property {number} [maxFileSize] - Max file size in bytes [// optional, default: Discord limit]
 * @property {('debug'|'info'|'warn'|'error')} [logLevel] - Logging verbosity level [// optional, default: 'info']
 */

/**
 * Loads and parses a config file (JSON or YAML). Does not emit any application events.
 * @param configPath string - Path to config file (e.g. './config.json')
 * @returns Promise<AppConfig> - Parsed config object
 * @throws Error if file cannot be read or parsed
 * @example
 * import { readConfigFile } from './common/configReader';
 * const config = await readConfigFile('./config.json');
 */
export async function readConfigFile(configPath: string): Promise<any> {
    try {
        const raw = await readFile(configPath, 'utf-8');
        let config: any; // Parsed config object

        if (configPath.endsWith('.json')) {
            config = JSON.parse(raw);
        } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
            // Lazy-load yaml parser only if needed
            const yaml = await import('js-yaml');
            config = yaml.load(raw);
        } else {
            throw new Error('Unsupported config file format. Use .json or .yaml');
        }
        return config;
    } catch (err) {
        throw err;
    }
}
