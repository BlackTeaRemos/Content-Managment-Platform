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
    correlationId?: string; // tracing id
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
