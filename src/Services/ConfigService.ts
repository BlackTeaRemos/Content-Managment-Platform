import { EventEmitter } from 'events';
import { LoadConfig } from '../Config.js';
import type { ValidatedConfig } from '../Types/Config.js';
import type { Neo4jConfig } from '../Repository/Neo4jClient.js';
import Joi from 'joi';
import { resolve } from 'path';

/**
 * Service responsible for loading and validating application configuration.
 */
export class ConfigService {
    /** Event bus for emitting config-related events */
    private _eventBus: EventEmitter;

    /**
     * Constructs a ConfigService.
     * @param eventBus EventEmitter - Event bus used for emitting `config:loaded`.
     */
    constructor(eventBus: EventEmitter) {
        this._eventBus = eventBus;
    }

    /**
     * Loads and validates the configuration from a JSON file.
     * @param path string - Filesystem path to the config JSON. Example: './config/config.json'
     * @returns Promise<ValidatedConfig> - The validated config object.
     * @throws Error if loading or validation fails.
     * @example
     * const configService = new ConfigService(eventBus);
     * const config = await configService.Load('./config/config.json');
     */
    public async Load(path: string): Promise<ValidatedConfig> {
        try {
            const rawConfig = await LoadConfig(path);
            // Build Joi schema to validate app config (treat null as empty and default to {})
            const schema = Joi.object({
                discordToken: Joi.string().required(),
                discordGuildId: Joi.string().required(),
                discordCategoryId: Joi.string().required(),
                logLevel: Joi.string().valid(`debug`, `info`, `warn`, `error`),
                dataRoot: Joi.string(),
                mirrorRoot: Joi.string(),
                tempRoot: Joi.string(),
                neo4j: Joi.object({
                    uri: Joi.string().required(),
                    username: Joi.string().required(),
                    password: Joi.string().required(),
                    database: Joi.string().optional(),
                }).required(),
            })
                .unknown(true)
                .empty(null)
                .default({});
            const { value, error } = schema.validate(rawConfig);

            if (error) {
                throw new Error(`Config validation error: ${error.message}`);
            }
            // Env overrides (highest precedence)
            const envDataRoot = process.env.VPI_DATA_ROOT;
            const envMirrorRoot = process.env.VPI_MIRROR_ROOT;
            const envTempRoot = process.env.VPI_TEMP_ROOT;

            const dataRoot = resolve(envDataRoot || (value.dataRoot as string) || `./data`);
            const mirrorRoot = resolve(envMirrorRoot || (value.mirrorRoot as string) || dataRoot + `/mirror`);
            const tempRoot = resolve(envTempRoot || (value.tempRoot as string) || dataRoot + `/tmp`);

            const validated: ValidatedConfig = {
                discordToken: value.discordToken as string,
                discordGuildId: value.discordGuildId as string,
                discordCategoryId: value.discordCategoryId as string,
                logLevel: value.logLevel as `debug` | `info` | `warn` | `error` | undefined,
                dataRoot,
                mirrorRoot,
                tempRoot,
                neo4j: value.neo4j as Neo4jConfig,
            };
            this._eventBus.emit(`config:loaded`, validated);
            return validated;
        } catch(err: any) {
            throw new Error(`Failed to load config from '${path}': ${err.message}`);
        }
    }
}
