import type { ChatInputCommandInteraction } from 'discord.js';
import { resolveCommandPermission, type CommandPermissionResult } from './PermissionResolver.js';

/**
 * Context required for resolving view command permissions.
 * @property type string Selected object type (example: 'game').
 * @property id string Selected object identifier (example: 'game-123').
 */
export interface ViewPermissionContext {
    type: string;
    id: string;
}

export type ViewPermissionResult = CommandPermissionResult;

/**
 * Resolve view command permission tokens using the standardized resolver.
 * @param interaction ChatInputCommandInteraction Interaction requesting the permission (example: original slash interaction).
 * @param context ViewPermissionContext Context values applied to templates (example: { type: 'game', id: 'g-1' }).
 * @returns Promise<ViewPermissionResult> Resolution outcome describing allowance and tokens.
 * @example
 * const result = await resolveViewPermissions(interaction, { type: 'game', id: 'g-1' });
 */
export async function resolveViewPermissions(
    interaction: ChatInputCommandInteraction,
    context: ViewPermissionContext,
): Promise<ViewPermissionResult> {
    return resolveCommandPermission({
        interaction,
        templates: ['view:{type}:{id}'],
        context: { type: context.type, id: context.id },
        logSource: 'ViewFlow',
        action: `view:${context.type}:${context.id}`,
    });
}
