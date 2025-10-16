import { MessageFlags } from 'discord.js';
import { log } from '../Common/Log.js';
import {
    resolveTokens as resolvePermission,
    formatPermissionToken,
    type PermissionToken,
    type TokenSegmentInput,
    grantForever,
    resolve,
} from '../Common/permission/index.js';

/**
 * Factory for Discord interaction handler focused on chat input commands.
 * Replaces direct permission checks with `resolve` that asks admins and throws on denial.
 */
export function createInteractionHandler(options: { loadedCommands: Record<string, any> }) {
    const { loadedCommands } = options;

    return async function handleInteraction(interaction: any) {
        if (!interaction?.isChatInputCommand?.()) return;
        const command = loadedCommands[interaction.commandName];
        if (!command) return;

        try {
            const member = interaction.guild ? await interaction.guild.members.fetch(interaction.user.id) : null;

            // Resolve permission token templates for this command.
            const cmdAny = command as any;
            let rawTemplates:
                | string
                | string[]
                | ((interaction: any) => Promise<string | string[] | undefined>)
                | undefined = cmdAny.permissionTokens ?? cmdAny.permissions ?? `command:{commandName}`;

            const templates: (string | TokenSegmentInput[])[] = [];
            if (typeof rawTemplates === 'function') {
                try {
                    const t = await rawTemplates(interaction);
                    rawTemplates = t || `command:{commandName}`;
                } catch {
                    rawTemplates = `command:{commandName}`;
                }
            }
            if (typeof rawTemplates === 'string') {
                templates.push(rawTemplates);
            } else if (Array.isArray(rawTemplates)) {
                for (const entry of rawTemplates) templates.push(entry as string | TokenSegmentInput[]);
            }

            // Hydrated resolve context so admin approval UI can be shown as needed.
            const resolverCtx = {
                commandName: interaction.commandName,
                interaction,
                options: Object.fromEntries(interaction.options.data.map((o: any) => [o.name, o.value])),
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
                getMember: async () =>
                    interaction.guild ? await interaction.guild.members.fetch(interaction.user.id) : null,
            };

            // Use throwing resolver: will prompt admins when needed; throws if denied.
            const result = await resolve(templates, {
                context: resolverCtx,
                member,
                getMember: resolverCtx.getMember,
            });

            // Persist forever-grant if admin approved permanently
            if (result.detail.decision === 'approve_forever' && interaction.guildId) {
                // Grant the most specific token from templates
                const tokens: PermissionToken[] = [];
                const seen = new Set<string>();
                for (const tmpl of templates) {
                    for (const token of resolvePermission(tmpl, resolverCtx)) {
                        const display = formatPermissionToken(token);
                        if (seen.has(display)) continue;
                        seen.add(display);
                        tokens.push(token);
                    }
                }
                const grantToken = tokens?.[0] ?? interaction.commandName;
                grantForever(interaction.guildId, interaction.user.id, grantToken);
            }

            // Execute the command
            await command.execute(interaction);
        } catch (err: any) {
            // Centralized error handler for permission denials and execution errors
            try {
                log.error(`Interaction handler error for /${interaction.commandName}: ${String(err)}`, 'Boot');
            } catch {}
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content:
                            typeof err?.message === 'string' ? err.message : 'Permission denied or execution error.',
                        flags: MessageFlags.Ephemeral,
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content:
                            typeof err?.message === 'string' ? err.message : 'Permission denied or execution error.',
                    });
                }
            } catch {}
        }
    };
}
