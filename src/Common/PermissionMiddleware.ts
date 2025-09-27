/**
 * Permission middleware and decorators for existing commands
 * Allows adding permission checking to existing command structure without major refactoring
 */

import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { permissionEvaluator } from '../Services/PermissionEvaluator.js';
import { ephemeralPermissionManager } from '../Services/EphemeralPermissionManager.js';
import type { PermissionContext, PermissionRequest } from '../Domain/Permission.js';
import { log } from './Log.js';

/** Permission requirements for a command */
export interface CommandPermissionConfig {
    /** Required permissions for the command */
    requiredPermissions?: string[];
    /** Permissions required based on argument values */
    valuePermissions?: Record<string, string[]>;
    /** Tags that must be present */
    requiredTags?: string[];
    /** Whether this command requires admin privileges */
    adminOnly?: boolean;
    /** Custom permission ID override */
    customPermissionId?: string;
}

/**
 * Permission checker function that can be called at the start of any command
 */
export async function checkCommandPermissions(
    interaction: ChatInputCommandInteraction,
    config: CommandPermissionConfig
): Promise<{ allowed: boolean; response?: any }> {
    
    const permissionContext: PermissionContext = {
        userId: interaction.user.id,
        guildId: interaction.guildId || '',
        userRoleIds: [], // TODO: Extract from interaction if available
        channelId: interaction.channelId,
        metadata: {
            commandName: interaction.commandName,
            options: interaction.options.data
        }
    };

    // Build permission request
    const commandName = config.customPermissionId || 
        `command.${interaction.commandName}${interaction.options.getSubcommandGroup(false) ? `.${interaction.options.getSubcommandGroup()}` : ''}${interaction.options.getSubcommand(false) ? `.${interaction.options.getSubcommand()}` : ''}`;
    
    const permissionRequest: PermissionRequest = {
        commandPermission: config.adminOnly ? 'admin' : (config.requiredPermissions?.[0] || commandName),
        valuePermissions: [],
        requiredTags: config.requiredTags,
        reason: `Executing command ${commandName}`
    };

    // Add additional required permissions
    if (config.requiredPermissions && config.requiredPermissions.length > 1) {
        permissionRequest.valuePermissions!.push(...config.requiredPermissions.slice(1));
    }

    // Add value-based permissions
    if (config.valuePermissions) {
        for (const [optionName, permissions] of Object.entries(config.valuePermissions)) {
            const optionValue = interaction.options.get(optionName);
            if (optionValue !== null && optionValue !== undefined) {
                permissionRequest.valuePermissions!.push(...permissions);
            }
        }
    }

    try {
        const evalResult = await permissionEvaluator.evaluate(permissionContext, permissionRequest);

        if (evalResult.granted) {
            log.info(`Permission granted for command`, 'PermissionMiddleware',
                JSON.stringify({
                    userId: interaction.user.id,
                    commandName,
                    source: evalResult.source
                })
            );
            return { allowed: true };
        }

        // Permission denied
        log.warning(`Permission denied for command`, 'PermissionMiddleware',
            JSON.stringify({
                userId: interaction.user.id,
                commandName,
                reason: evalResult.reason,
                checkedPermissions: evalResult.checkedPermissions
            })
        );

        if (evalResult.requiresEphemeralGrant) {
            // Create ephemeral permission request
            try {
                const ephemeralRequest = await ephemeralPermissionManager.createPermissionRequest(
                    permissionContext,
                    permissionRequest,
                    commandName,
                    evalResult.reason || 'Permission denied'
                );

                const response = await interaction.reply({
                    content: `🔒 **Permission Required**\n\nThis command requires additional permissions. Administrators have been notified.\n\n**Request ID:** \`${ephemeralRequest.id.slice(0, 8)}...\`\n**Required Permission:** \`${permissionRequest.commandPermission}\`\n\nPlease wait for an administrator to approve your request.`,
                    flags: MessageFlags.Ephemeral
                });

                return { allowed: false, response };
            } catch (ephemeralError) {
                const response = await interaction.reply({
                    content: `❌ **Permission Denied**\n\n${ephemeralError instanceof Error ? ephemeralError.message : 'You do not have permission to use this command.'}`,
                    flags: MessageFlags.Ephemeral
                });

                return { allowed: false, response };
            }
        } else {
            const response = await interaction.reply({
                content: `❌ **Permission Denied**\n\n${evalResult.reason || 'You do not have permission to use this command.'}\n\n**Checked Permissions:**\n${evalResult.checkedPermissions.map(p => `• \`${p.id}\`: ${p.state}`).join('\n')}`,
                flags: MessageFlags.Ephemeral
            });

            return { allowed: false, response };
        }
    } catch (error) {
        log.error(`Error checking permissions`, 'PermissionMiddleware', String(error));
        
        const response = await interaction.reply({
            content: '⚠️ **Error checking permissions**\n\nPlease try again later or contact an administrator.',
            flags: MessageFlags.Ephemeral
        });

        return { allowed: false, response };
    }
}

/**
 * Decorator function that wraps a command execute function with permission checking
 */
export function requirePermissions(config: CommandPermissionConfig) {
    return function <T extends any[]>(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<(...args: T) => Promise<any>>
    ) {
        const originalMethod = descriptor.value;
        if (!originalMethod) return;

        descriptor.value = async function(...args: T) {
            const interaction = args[0] as ChatInputCommandInteraction;
            
            const permissionResult = await checkCommandPermissions(interaction, config);
            if (!permissionResult.allowed) {
                // Permission denied, response already sent
                return;
            }

            // Permission granted, execute original command
            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}

/**
 * Convenience function for adding permissions to existing command execute functions
 */
export function withPermissions<T extends any[]>(
    originalExecute: (...args: T) => Promise<any>,
    config: CommandPermissionConfig
): (...args: T) => Promise<any> {
    return async function(...args: T) {
        const interaction = args[0] as ChatInputCommandInteraction;
        
        const permissionResult = await checkCommandPermissions(interaction, config);
        if (!permissionResult.allowed) {
            // Permission denied, response already sent
            return;
        }

        // Permission granted, execute original command
        return originalExecute(...args);
    };
}

/**
 * Helper to create permission-aware command wrapper
 */
export function createPermissionAwareCommand(
    data: any,
    execute: (interaction: ChatInputCommandInteraction) => Promise<any>,
    permissions: CommandPermissionConfig
) {
    return {
        data,
        execute: withPermissions(execute, permissions)
    };
}