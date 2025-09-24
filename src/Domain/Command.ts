/**
 * Command Module interfaces for the VPI system.
 * These interfaces define structures for dynamic command loading and execution.
 */

/** Lightweight metadata describing a dynamically loadable command module. */
export interface CommandModuleMeta {
    id: string; // unique command identifier (slash name)
    description: string; // human description
    version?: string; // optional semantic version for reload diffing
    permissions?: {
        requiredRoles?: string[]; // discord role ids required
        allowDM?: boolean; // whether usable in DMs
    };
    tags?: string[]; // module categorization tags
}

/** Execution context for avoiding recomputation and sharing state across command execution flow. */
export interface ExecutionContext {
    /** Correlation ID for tracing requests */
    correlationId: string;
    /** Cache for storing computed values to avoid recomputation */
    cache: Map<string, any>;
    /** Shared state object that can be modified by developers for custom context */
    shared: Record<string, any>;
    /** Timestamp when context was created */
    createdAt: Date;
    /** Get or compute cached value */
    getOrCompute<T>(key: string, computeFn: () => Promise<T> | T): Promise<T>;
    /** Check if key exists in cache */
    has(key: string): boolean;
    /** Set cached value */
    set(key: string, value: any): void;
    /** Clear all cached values */
    clear(): void;
    /** Get cache statistics for debugging/monitoring (optional implementation) */
    getStats?(): { size: number; keys: string[]; createdAt: Date; correlationId: string };
}

/** Arguments passed to a command execute handler (abstracted from discord.js specifics for testability). */
export interface CommandExecutionContext {
    guildId: string; // guild scope
    userId: string; // invoking user
    channelId: string; // channel invoking
    options: Record<string, any>; // parsed options/arguments
    // Responder supports a minimal subset of Discord.js reply/followUp/editReply options.
    // Prefer using flags (e.g., MessageFlags.Ephemeral) for privacy instead of ephemeral: true when possible.
    reply: (
        message: string | { content?: string; ephemeral?: boolean; flags?: number; embeds?: any[]; components?: any[] },
    ) => Promise<any>; // responder
    correlationId?: string; // tracing id (deprecated - use executionContext.correlationId)
    /** Execution context for caching and shared state across command execution flow */
    executionContext?: ExecutionContext;
}

/** Result contract for an executed command. */
export interface CommandResult {
    ok: boolean; // success flag
    message?: string; // user facing summary
    data?: any; // structured payload
    error?: string; // error code/message
}

/** Dynamic command module interface loaded from file system for hot reload. */
export interface CommandModule {
    meta: CommandModuleMeta; // descriptive metadata
    register?: (registry: { slash: (def: { name: string; description: string }) => void }) => void; // optional registration hook
    execute: (ctx: CommandExecutionContext) => Promise<CommandResult>; // execution entry
    dispose?: () => Promise<void> | void; // cleanup on unload
}
