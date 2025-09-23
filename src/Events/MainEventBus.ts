/**
 * Central event bus for managing and dispatching application events between components.
 */
import { EventEmitter } from 'events';
import type { EventName } from '../Domain/index.js';
import { metricsService } from '../Services/MetricsService.js';

/**
 * MainEventBus is the central event system for all internal communication.
 * Used for backend, Discord, and UI event propagation.
 */
export class MainEventBus extends EventEmitter {
    /**
     * Creates a new MainEventBus instance.
     * @example
     * const bus = new MainEventBus();
     */
    constructor() {
        super();
    }
    /** Typed emit helper enforcing known event names. */
    public Emit<T extends EventName>(eventName: T, ...args: any[]): boolean {
        // wrapper for clarity
        metricsService.IncEvent(eventName); // metrics instrumentation (Stage 8)
        return super.emit(eventName, ...args);
    }
    /** Typed on helper enforcing known event names. */
    public On<T extends EventName>(eventName: T, listener: (...args: any[]) => void): this {
        super.on(eventName, listener);
        return this;
    }
}

/**
 * Global event bus instance for the application.
 * Use this for all cross-module communication.
 * @example
 * import { mainEventBus } from './events/MainEventBus';
 * mainEventBus.on('discord:ready', ...);
 */
export const MAIN_EVENT_BUS = new MainEventBus();
