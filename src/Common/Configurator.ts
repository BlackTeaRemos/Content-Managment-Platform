import Joi, { ObjectSchema } from 'joi';

/**
 * Configurator validates and stores configuration using a Joi schema.
 * @template T - The expected shape of the configuration object
 */
export class Configurator<T> {
    /** Joi schema used for validation */
    private readonly _schema: ObjectSchema<T>;
    /** Stored, validated configuration object */
    private _config: T;

    /**
     * Creates a Configurator.
     * @param schema ObjectSchema<T> - Joi schema for validating the configuration
     * @param rawConfig unknown - Raw configuration object to validate
     * @throws Throws a Joi.ValidationError if validation fails
     * @example
     * const schema = Joi.object({ port: Joi.number().required() });
     * const configurator = new Configurator(schema, { port: 3000 });
     */
    constructor(schema: ObjectSchema<T>, rawConfig: unknown) {
        this._schema = schema;
        const { error, value } = this._schema.validate(rawConfig);

        if (error) {
            throw error;
        }
        this._config = value;
    }

    /**
     * Retrieves the stored configuration.
     * @returns T - Validated configuration object
     */
    public getConfig(): T {
        return this._config;
    }

    /**
     * Updates the configuration by validating new raw configuration.
     * @param rawConfig unknown - New raw configuration to validate
     * @throws Throws a Joi.ValidationError if validation fails
     */
    public updateConfig(rawConfig: unknown): void {
        const { error, value } = this._schema.validate(rawConfig);

        if (error) {
            throw error;
        }
        this._config = value;
    }
}
