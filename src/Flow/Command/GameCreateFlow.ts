import type { ChatInputCommandInteraction } from 'discord.js';
import { resolveCommandPermission, type CommandPermissionResult } from './PermissionResolver.js';

/**
 * Context used when resolving game creation permissions.
 * @property serverId string Identifier of the guild where game is created (example: '123').
 */
export interface GameCreatePermissionContext {
    serverId: string;
}

export type GameCreatePermissionResult = CommandPermissionResult;

/**
 * Resolve permissions for the game creation flow, handling admin approval when required.
 * @param interaction ChatInputCommandInteraction Interaction requesting creation (example: slash command interaction).
 * @param context GameCreatePermissionContext Context describing the target server (example: { serverId: '123' }).
 * @returns Promise<GameCreatePermissionResult> Outcome of permission resolution.
 * @example
 * const outcome = await resolveGameCreatePermissions(interaction, { serverId: guildId });
 */
export async function resolveGameCreatePermissions(
    interaction: ChatInputCommandInteraction,
    context: GameCreatePermissionContext,
): Promise<GameCreatePermissionResult> {
    return resolveCommandPermission({
        interaction,
        templates: [`object:game:create:{serverId}`, `object:game:create`],
        context: { serverId: context.serverId },
        logSource: `GameCreateFlow`,
        action: `object:game:create:${context.serverId}`,
    });
}
