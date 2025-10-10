/**
 * Utilities for command-level permission checks with contextual token resolution.
 * @example
 * const result = await ensureCommandPermission(interaction, { templates: ['object:game:create:{serverId}'], context: { serverId } });
 */
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import {
    grantForever,
    resolve,
    type PermissionDecision,
    type PermissionToken,
    type PermissionsObject,
    type TokenResolveContext,
    type TokenSegmentInput,
} from '../../Common/permission/index.js';
import { requestPermissionFromAdmin } from '../../Flow/permission/PermissionUI.js';
import { log } from '../../Common/Log.js';

/**
 * Options for ensureCommandPermission.
 * @property templates Array of templates resolved to permission tokens (example: ['object:game:create:{serverId}']).
 * @property context Additional context values merged into the resolver context (example: { serverId: '123' }).
 * @property permissions Permission configuration object when available from config.
 * @property member Optional guild member to avoid refetching (example: cached GuildMember).
 * @property skipAdminApproval When true, skip admin approval flow and return immediately.
 */
export interface EnsureCommandPermissionOptions {
    templates: Array<string | TokenSegmentInput[]>;
    context?: Record<string, unknown>;
    permissions?: PermissionsObject;
    member?: GuildMember | null;
    skipAdminApproval?: boolean;
}

/**
 * Result of ensureCommandPermission.
 * @property allowed Indicates whether action is permitted (example: true when allowed).
 * @property reason Explanation message when denied (example: 'Explicitly forbidden').
 * @property tokens Tokens evaluated during the check (example: [['object','game','create','123']]).
 * @property decision Admin decision when approval was requested (example: 'approve_once').
 */
export interface EnsureCommandPermissionResult {
    allowed: boolean;
    reason?: string;
    tokens: PermissionToken[];
    decision?: PermissionDecision;
}

function __buildBaseContext(interaction: ChatInputCommandInteraction): TokenResolveContext {
    const options = Object.fromEntries(interaction.options.data.map(o => [o.name, o.value]));
    return {
        commandName: interaction.commandName,
        guildId: interaction.guildId ?? undefined,
        userId: interaction.user.id,
        options,
    };
}

async function __getMember(
    interaction: ChatInputCommandInteraction,
    provided: GuildMember | null | undefined,
): Promise<GuildMember | null> {
    if (provided !== undefined) return provided ?? null;
    if (!interaction.guild) return null;
    try {
        return await interaction.guild.members.fetch(interaction.user.id);
    } catch (error) {
        log.warning(`Failed to fetch guild member: ${String(error)}`, 'PermissionGuard', 'ensureCommandPermission');
        return null;
    }
}

/**
 * Ensure a command action is allowed by resolving permission templates against context and triggering approval flow if needed.
 * @param interaction ChatInputCommandInteraction Command interaction requesting permission (example: original slash interaction).
 * @param options EnsureCommandPermissionOptions Configuration describing templates and optional context.
 * @returns Promise<EnsureCommandPermissionResult> Outcome of the permission check.
 * @example
 * const result = await ensureCommandPermission(interaction, { templates: ['object:game:create:{serverId}'], context: { serverId } });
 */
export async function ensureCommandPermission(
    interaction: ChatInputCommandInteraction,
    options: EnsureCommandPermissionOptions,
): Promise<EnsureCommandPermissionResult> {
    const baseContext = __buildBaseContext(interaction);
    const mergedContext = { ...baseContext, ...(options.context ?? {}) } as TokenResolveContext;
    const ensureOptions: Parameters<typeof resolve.ensure>[1] = {
        context: mergedContext,
        permissions: options.permissions,
        skipApproval: options.skipAdminApproval,
        getMember: () => __getMember(interaction, options.member),
        requestApproval: async payload => {
            if (options.skipAdminApproval) {
                return 'deny';
            }
            if (!interaction.deferred && !interaction.replied) {
                try {
                    await interaction.deferReply({ ephemeral: true });
                } catch (error) {
                    log.warning(
                        `Failed to defer interaction: ${String(error)}`,
                        'PermissionGuard',
                        'ensureCommandPermission',
                    );
                }
            }
            const decision = await requestPermissionFromAdmin(interaction, payload);
            if (decision === 'approve_forever' && interaction.guildId) {
                grantForever(interaction.guildId, interaction.user.id, payload.tokens[0] ?? []);
            }
            return decision;
        },
    };

    if (options.member !== undefined) {
        ensureOptions.member = options.member;
    }

    const outcome = await resolve.ensure(options.templates, ensureOptions);

    return {
        allowed: outcome.success,
        reason: outcome.detail.reason,
        tokens: outcome.detail.tokens,
        decision: outcome.detail.decision,
    };
}
