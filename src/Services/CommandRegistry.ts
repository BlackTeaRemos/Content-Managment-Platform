import { MAIN_EVENT_BUS } from '../Events/MainEventBus.js';
import {
    EVENT_NAMES,
    CommandModule,
    CommandModuleMeta,
    CommandResult,
    CommandExecutionContext,
    createExecutionContext,
} from '../Domain/index.js';
import { PermissionManager, PermissionContext } from '../Domain/Permission.js';
import { log } from '../Common/Log.js';

/** Error thrown when attempting to register a duplicate command id. */
export class DuplicateCommandError extends Error {
    constructor(id: string) {
        super(`Command '${id}' already registered`);
    }
}
/** Error thrown when looking up a missing command. */
export class CommandNotFoundError extends Error {
    constructor(id: string) {
        super(`Command '${id}' not found`);
    }
}

/** Options controlling CommandRegistry behavior. */
export interface CommandRegistryOptions {
    caseInsensitive?: boolean;
    permissionManager?: PermissionManager;
}

/** Internal storage entry capturing module & load timestamp. */
interface RegistryEntry {
    module: CommandModule;
    loadedAt: number;
}

/**
 * CommandRegistry maintains live set of dynamically loadable command modules.
 * Emits lifecycle events: command.loaded, command.reloaded, command.unloaded (future) via MAIN_EVENT_BUS.
 */
export class CommandRegistry {
    private _commands: Map<string, RegistryEntry> = new Map(); // id -> entry
    private _caseInsensitive: boolean; // normalization toggle
    private _stats = { loads: 0, reloads: 0, failures: 0 }; // metrics counters
    private _permissionManager?: PermissionManager; // permission system integration

    constructor(opts: CommandRegistryOptions = {}) {
        this._caseInsensitive = !!opts.caseInsensitive;
        this._permissionManager = opts.permissionManager;
    }

    /** Normalize key based on case-insensitivity option. */
    private __norm(id: string): string {
        return this._caseInsensitive ? id.toLowerCase() : id;
    }

    /** Register new command module. Throws on duplicate id unless version differs triggering reload. */
    public Register(mod: CommandModule): void {
        const id = this.__norm(mod.meta.id);
        const existing = this._commands.get(id);

        if (existing) {
            // Reload if the incoming module declares a version AND it differs from the existing version (including existing undefined)
            if (mod.meta.version && existing.module.meta.version !== mod.meta.version) {
                existing.module.dispose?.();
                this._commands.set(id, { module: mod, loadedAt: Date.now() });
                this._stats.reloads++;
                MAIN_EVENT_BUS.Emit(EVENT_NAMES.commandReloaded, { id, version: mod.meta.version });
                return;
            }
            // Otherwise it's a hard duplicate
            this._stats.failures++;
            throw new DuplicateCommandError(mod.meta.id);
        }
        this._commands.set(id, { module: mod, loadedAt: Date.now() });
        this._stats.loads++;
        MAIN_EVENT_BUS.Emit(EVENT_NAMES.commandLoaded, { id, version: mod.meta.version });
    }

    /** Unregister a command; idempotent. */
    public Unregister(id: string): void {
        const norm = this.__norm(id);
        const entry = this._commands.get(norm);

        if (!entry) {
            return;
        } // silent for idempotency
        entry.module.dispose?.();
        this._commands.delete(norm);
        // Future: emit command.unloaded event name once defined in EVENT_NAMES
    }

    /** Lookup command module (throws if missing). */
    public Get(id: string): CommandModule {
        const entry = this._commands.get(this.__norm(id));

        if (!entry) {
            throw new CommandNotFoundError(id);
        }
        return entry.module;
    }

    /** Execute command by id with context; returns CommandResult. */
    public async Execute(id: string, ctx: CommandExecutionContext): Promise<CommandResult> {
        const mod = this.Get(id);

        try {
            // Legacy permission check
            if (mod.meta.permissions?.requiredRoles && !ctx.options.__userRoles) {
                return { ok: false, error: 'MISSING_ROLES', message: 'Role information not provided' };
            }

            // New permission system check
            if (this._permissionManager && mod.meta.permissions?.requiredTags?.length) {
                const permissionContext: PermissionContext = {
                    userId: ctx.userId,
                    guildId: ctx.guildId,
                    requiredTags: mod.meta.permissions.requiredTags,
                    userRoleIds: ctx.options.__userRoles
                };

                const permissionResult = await this._permissionManager.evaluate(permissionContext);
                
                if (!permissionResult.allowed) {
                    log.info(`Command ${id} blocked for user ${ctx.userId}: ${permissionResult.reasons.join(', ')}`, 'CommandRegistry');
                    
                    // If ephemeral grant is available, create request
                    if (permissionResult.requiresEphemeralGrant) {
                        try {
                            const requestId = await this._permissionManager.requestEphemeralGrant(
                                permissionContext,
                                `Command: /${id} - ${mod.meta.description}`,
                                'Permission denied for required tags: ' + permissionResult.missingTags.join(', ')
                            );
                            
                            return {
                                ok: false,
                                error: 'PERMISSION_DENIED',
                                message: `Permission denied. Ephemeral grant requested (ID: ${requestId}). Users with permission management rights will be notified.`,
                                data: { ephemeralRequestId: requestId }
                            };
                        } catch (error) {
                            log.error(`Failed to create ephemeral permission request: ${error}`, 'CommandRegistry');
                        }
                    }
                    
                    return {
                        ok: false,
                        error: 'PERMISSION_DENIED',
                        message: `Permission denied: ${permissionResult.reasons.join(', ')}`
                    };
                }
                
                log.debug(`Command ${id} permission check passed for user ${ctx.userId} at ${permissionResult.level} level`, 'CommandRegistry');
            }

            return await mod.execute(ctx);
        } catch (err: any) {
            return { ok: false, error: err?.message || 'UNKNOWN_ERROR' };
        }
    }

    /** List all registered command metas. */
    public List(): CommandModuleMeta[] {
        return Array.from(this._commands.values()).map(e => e.module.meta);
    }

    /** Get stats about command registry activity. */
    public Stats(): { loads: number; reloads: number; failures: number; registered: number } {
        return { ...this._stats, registered: this._commands.size };
    }
}

export { commandRegistry } from '../Setup/PermissionSystem.js'; // singleton with permission system
