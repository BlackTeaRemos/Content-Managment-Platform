import { MAIN_EVENT_BUS } from '../Events/MainEventBus.js';
import {
    EVENT_NAMES,
    CommandModule,
    CommandModuleMeta,
    CommandResult,
    CommandExecutionContext,
    createExecutionContext,
} from '../Domain/index.js';
import {
    checkPermission,
    resolveTokens as resolvePermission,
    formatPermissionToken,
    type PermissionTokenInput,
    type PermissionsObject,
} from '../Common/permission/index.js';
import type { GuildMember } from 'discord.js';

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

    constructor(opts: CommandRegistryOptions = {}) {
        this._caseInsensitive = !!opts.caseInsensitive;
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
    public async Execute(
        id: string,
        ctx: CommandExecutionContext,
        opts?: {
            permissions?: PermissionsObject; // optional permission map override
            member?: GuildMember | null; // optional guild member to evaluate permissions with
            skipApproval?: boolean; // when true, do not attempt any interactive approval (programmatic execution)
            skipPermissionCheck?: boolean; // allow caller to bypass permission evaluation
            userRoles?: string[]; // optional role ids for evaluation when member is not available
        },
    ): Promise<CommandResult> {
        const mod = this.Get(id);

        try {
            // Ensure a concrete executionContext exists (docs guarantee automatic creation)
            try {
                if (!ctx.executionContext) {
                    (ctx as any).executionContext = createExecutionContext();
                }
            } catch {
                // ignore - defensive in case the ctx shape is unexpected at runtime
            }

            // Respect DM allowance from meta
            if (!mod.meta.permissions?.allowDM && (!ctx.guildId || ctx.guildId === ``)) {
                return { ok: false, error: `DM_NOT_ALLOWED`, message: `Command cannot be used in DMs` };
            }

            // Simple role-based check retained for backwards compatibility
            if (mod.meta.permissions?.requiredRoles) {
                const required = mod.meta.permissions.requiredRoles;
                const providedRoles: string[] | undefined =
                    (ctx.options && (ctx.options as any).__userRoles) ?? opts?.userRoles;

                if (!providedRoles && !opts?.member) {
                    return { ok: false, error: `MISSING_ROLES`, message: `Role information not provided` };
                }

                let hasRole = false;
                if (Array.isArray(providedRoles)) {
                    hasRole = providedRoles.some(r => {
                        return required.includes(r);
                    });
                } else if (opts?.member) {
                    const mem: any = opts.member;
                    const memRoles = mem.roles?.cache ? Array.from(mem.roles.cache.keys()) : (mem.roles ?? []);
                    if (Array.isArray(memRoles)) {
                        hasRole = memRoles.some(r => {
                            return required.includes(r);
                        });
                    }
                }

                if (!hasRole) {
                    return { ok: false, error: `MISSING_ROLES`, message: `User lacks required roles` };
                }
            }

            // Permission token evaluation (skip when caller asks to bypass)
            if (!opts?.skipPermissionCheck) {
                const cmdAny = mod as any;
                let rawTemplates: string | string[] | Function | undefined =
                    cmdAny.permissionTokens ?? `command:${mod.meta.id}`;

                // If the module exported a function for templates we cannot reliably execute it
                // in a programmatic context that is not a Discord interaction. Fall back to
                // the canonical command token in that case.
                const templates: (string | any[])[] = [];
                if (typeof rawTemplates === `function`) {
                    templates.push(`command:${mod.meta.id}`);
                } else if (typeof rawTemplates === `string`) {
                    templates.push(rawTemplates);
                } else if (Array.isArray(rawTemplates)) {
                    for (const entry of rawTemplates) {
                        templates.push(entry as string | any[]);
                    }
                }

                // Build resolver context from the execution context. Include a getMember helper
                // so token resolvers can fetch a GuildMember when needed (programmatic callers
                // may provide `opts.member` or rely on getMember for fetching).
                const resolverCtx = {
                    commandName: mod.meta.id,
                    options: ctx.options,
                    userId: ctx.userId,
                    guildId: ctx.guildId ?? undefined,
                    executionContext: ctx.executionContext,
                    getMember: async() => {
                        if (opts?.member) {
                            return opts.member;
                        }
                        // Best-effort: if ctx contains a guildId and the registry has access to a
                        // guild fetcher it could be used here; leave as null for now when not available.
                        return null;
                    },
                } as const;

                // Resolve templates into concrete tokens (most-specific first)
                const tokens: any[] = [];
                const seen = new Set<string>();
                for (const tmpl of templates) {
                    const resolved = resolvePermission(tmpl as any, resolverCtx as any);
                    for (const token of resolved) {
                        const display = formatPermissionToken(token);
                        if (seen.has(display)) {
                            continue;
                        }
                        seen.add(display);
                        tokens.push(token);
                    }
                }

                const inputs: PermissionTokenInput[] = tokens.length
                    ? tokens.map(t => {
                        return [...t];
                    })
                    : [`command:${mod.meta.id}`];

                // Build a minimal member-like object when none provided so permanent grants can be checked
                let member = opts?.member ?? null;
                if (!member && ctx.guildId && ctx.userId) {
                    member = {
                        id: ctx.userId,
                        guild: { id: ctx.guildId },
                        permissions: { has: (_: any) => {
                            return false;
                        } },
                    } as unknown as GuildMember;
                }

                // Allow callers to override the permissions map via opts.permissions; otherwise
                // use undefined which will make checkPermission consult the default source.
                const evaluation = await checkPermission(opts?.permissions ?? undefined, member, inputs);

                if (!evaluation.allowed) {
                    if (evaluation.requiresApproval && !opts?.skipApproval) {
                        // Programmatic callers cannot request interactive admin approval here.
                        return {
                            ok: false,
                            error: `PERMISSION_REQUIRES_APPROVAL`,
                            message: evaluation.reason ?? `Permission requires approval`,
                        };
                    }
                    return { ok: false, error: `PERMISSION_DENIED`, message: evaluation.reason ?? `Permission denied` };
                }
            }

            return await mod.execute(ctx);
        } catch(err: any) {
            return { ok: false, error: err?.message || `UNKNOWN_ERROR` };
        }
    }

    /** List all registered command metas. */
    public List(): CommandModuleMeta[] {
        return Array.from(this._commands.values()).map(e => {
            return e.module.meta;
        });
    }

    /** Get stats about command registry activity. */
    public Stats(): { loads: number; reloads: number; failures: number; registered: number } {
        return { ...this._stats, registered: this._commands.size };
    }
}

export const commandRegistry = new CommandRegistry(); // default singleton
