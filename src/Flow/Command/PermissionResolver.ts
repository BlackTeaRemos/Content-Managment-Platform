import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import {
    grantForever,
    resolve,
    type PermissionDecision,
    type PermissionToken,
    type TokenSegmentInput,
    type TokenResolveContext,
} from '../../Common/permission/index.js';
import { log } from '../../Common/Log.js';
// Permission UI is an interactive helper; flows should not import UI directly.
// Interactive permission requests live under SubCommand so commands can decide when to prompt.
import { requestPermissionFromAdmin } from '../../SubCommand/Permission/PermissionUI.js';

export interface CommandPermissionResult {
    allowed: boolean;
    reason?: string;
    tokens: PermissionToken[];
    decision?: PermissionDecision;
    requiresApproval?: boolean;
}

export interface ResolveCommandPermissionOptions {
    interaction: ChatInputCommandInteraction;
    templates: Array<string | TokenSegmentInput[]>;
    context?: Record<string, unknown>;
    logSource: string;
    action?: string;
    skipApproval?: boolean;
}

export async function resolveCommandPermission(
    options: ResolveCommandPermissionOptions,
): Promise<CommandPermissionResult> {
    const { interaction, templates, context = {}, logSource, action = 'command' } = options;
    const baseContext: TokenResolveContext = {
        commandName: interaction.commandName,
        guildId: interaction.guildId ?? undefined,
        userId: interaction.user.id,
        options: Object.fromEntries(interaction.options.data.map(o => [o.name, o.value])),
        ...context,
    };

    log.info(
        `${logSource}: resolving permissions for action=${action} user=${interaction.user.id}`,
        logSource,
        'resolveCommandPermission',
    );

    // Flows should not perform interactive approval. Ask resolve.ensure to evaluate permissions
    // and indicate whether approval is required. Commands or subcommands should trigger the
    // interactive approval UI when needed.
    const outcome = await resolve.ensure(templates, {
        context: baseContext,
        member: await getMember(interaction, logSource, action),
        // Do not provide requestApproval delegate here: keep flow non-interactive
        skipApproval: true,
    });

    log.info(
        `${logSource}: permission result action=${action} success=${outcome.success} reason=${outcome.detail.reason}`,
        logSource,
        'resolveCommandPermission',
    );

    return {
        allowed: outcome.success,
        reason: outcome.detail.reason,
        tokens: outcome.detail.tokens,
        decision: outcome.detail.decision,
        requiresApproval: outcome.detail.requiresApproval,
    };
}

async function getMember(
    interaction: ChatInputCommandInteraction,
    logSource: string,
    action: string,
): Promise<GuildMember | null> {
    if (!interaction.guild) {
        log.info(`${logSource}: no guild context for action=${action}`, logSource, 'resolveCommandPermission');
        return null;
    }
    try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        log.info(
            `${logSource}: fetched guild member ${member.id} for action=${action}`,
            logSource,
            'resolveCommandPermission',
        );
        return member;
    } catch (error) {
        log.warning(
            `${logSource}: failed to fetch guild member for action=${action} reason=${String(error)}`,
            logSource,
            'resolveCommandPermission',
        );
        return null;
    }
}

// requestApprovalWithLogging removed from flow to keep flows UI-free. Interactive approval
// should be invoked from command handlers via the SubCommand/Permission helper.
