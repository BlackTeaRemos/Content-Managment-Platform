import { Configurator } from './Configurator.js';
import { EventEmitter } from 'events';

/**
 * Session holds per-server context, including validated configuration and event bus.
 * @template T - Configuration shape
 */
export class Session<T> {
    /** Server-specific configuration */
    private readonly _configurator: Configurator<T>;
    /** Event bus for handling server events */
    public readonly events: EventEmitter;

    /**
     * Initializes a new Session.
     * @param schema import('joi').ObjectSchema<T> - Joi schema for server configuration
     * @param rawConfig unknown - Raw configuration to validate
     */
    constructor(schema: import('joi').ObjectSchema<T>, rawConfig: unknown) {
        // Treat null or non-object rawConfig as empty object for validation
        const safeConfig = rawConfig != null && typeof rawConfig === 'object' ? rawConfig : {};
        this._configurator = new Configurator<T>(schema, safeConfig);
        this.events = new EventEmitter();
    }

    /**
     * Retrieves the validated configuration object.
     * @returns T - Server configuration
     */
    public get config(): T {
        return this._configurator.getConfig();
    }

    /**
     * Emits an event on the session's event bus.
     * @param event string - Event name
     * @param args any[] - Event arguments
     */
    public emit(event: string, ...args: any[]): void {
        this.events.emit(event, ...args);
    }

    /**
     * Registers a listener on the session's event bus.
     * @param event string - Event name
     * @param listener (...args: any[]) => void - Handler function
     */
    public on(event: string, listener: (...args: any[]) => void): void {
        this.events.on(event, listener);
    }
}
