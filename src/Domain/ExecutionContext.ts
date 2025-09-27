import { ExecutionContext } from './Command.js';
import { randomUUID } from 'crypto';

/**
 * Concrete implementation of ExecutionContext that provides caching and shared state
 * for command execution flow to avoid unnecessary recomputations.
 */
export class CommandExecutionContextImpl implements ExecutionContext {
    public readonly correlationId: string;
    public readonly cache: Map<string, any> = new Map();
    public readonly shared: Record<string, any> = {};
    public readonly createdAt: Date = new Date();

    constructor(correlationId?: string) {
        this.correlationId = correlationId || randomUUID();
    }

    /**
     * Get cached value or compute it if not present.
     * This method is the primary way to avoid recomputation in command flows.
     *
     * @param key Cache key
     * @param computeFn Function to compute the value if not cached
     * @returns Promise resolving to the cached or computed value
     *
     * @example
     * // Avoid recomputing expensive database query
     * const user = await ctx.executionContext.getOrCompute(
     *   `user:${userId}`,
     *   () => database.getUser(userId)
     * );
     */
    async getOrCompute<T>(key: string, computeFn: () => Promise<T> | T): Promise<T> {
        if (this.cache.has(key)) {
            return this.cache.get(key) as T;
        }

        const value = await computeFn();
        this.cache.set(key, value);
        return value;
    }

    /**
     * Check if a key exists in the cache.
     */
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * Set a cached value directly.
     */
    set(key: string, value: any): void {
        this.cache.set(key, value);
    }

    /**
     * Clear all cached values.
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics for debugging/monitoring.
     */
    getStats(): { size: number; keys: string[]; createdAt: Date; correlationId: string } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
            createdAt: this.createdAt,
            correlationId: this.correlationId,
        };
    }
}

/**
 * Factory function to create a new ExecutionContext instance.
 *
 * @param correlationId Optional correlation ID for tracing
 * @returns New ExecutionContext instance
 */
export function createExecutionContext(correlationId?: string): ExecutionContext {
    return new CommandExecutionContextImpl(correlationId);
}
