/**
 * Admin Permission Management Commands
 * Provides interfaces for administrators to manage the permission system.
 */

import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    SlashCommandSubcommandBuilder,
    MessageFlags,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { permissionRepository } from '../../Services/PermissionRepository.js';
import { permissionEvaluator } from '../../Services/PermissionEvaluator.js';
import { ephemeralPermissionManager } from '../../Services/EphemeralPermissionManager.js';
import { PermissionState } from '../../Domain/Permission.js';
import { createCommandContext } from '../../Common/ExecutionContextHelpers.js';
import { log } from '../../Common/Log.js';

// Main admin command with permissions subcommand group
export const data = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administrative commands')
    .addSubcommandGroup(group =>
        group
            .setName('permissions')
            .setDescription('Manage user and organization permissions')
            .addSubcommand(sub =>
                sub
                    .setName('grant')
                    .setDescription('Grant a permission to a user')
                    .addUserOption(option =>
                        option.setName('user').setDescription('User to grant permission to').setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('permission').setDescription('Permission ID to grant').setRequired(true)
                    )
                    .addStringOption(option =>
                        option
                            .setName('state')
                            .setDescription('Permission state')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Allowed', value: 'allowed' },
                                { name: 'Once', value: 'once' },
                                { name: 'Forbidden', value: 'forbidden' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('reason').setDescription('Reason for granting the permission').setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('revoke')
                    .setDescription('Revoke a permission from a user')
                    .addUserOption(option =>
                        option.setName('user').setDescription('User to revoke permission from').setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('permission').setDescription('Permission ID to revoke').setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('list')
                    .setDescription('List permissions for a user')
                    .addUserOption(option =>
                        option.setName('user').setDescription('User to list permissions for').setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('pending')
                    .setDescription('View and manage pending permission requests')
            )
            .addSubcommand(sub =>
                sub
                    .setName('audit')
                    .setDescription('View permission audit log')
                    .addUserOption(option =>
                        option.setName('user').setDescription('Filter by user (optional)').setRequired(false)
                    )
            )
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);
    const subcommandGroup = interaction.options.getSubcommandGroup(true);
    const subcommand = interaction.options.getSubcommand(true);

    // Verify user has admin permissions
    const isAdmin = await permissionRepository.isUserAdmin(ctx.userId, ctx.guildId);
    if (!isAdmin) {
        return await ctx.reply({
            content: 'You do not have permission to use admin commands.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (subcommandGroup === 'permissions') {
        switch (subcommand) {
            case 'grant':
                return await handleGrantPermission(interaction, ctx);
            case 'revoke':
                return await handleRevokePermission(interaction, ctx);
            case 'list':
                return await handleListPermissions(interaction, ctx);
            case 'pending':
                return await handlePendingRequests(interaction, ctx);
            case 'audit':
                return await handleAuditLog(interaction, ctx);
            default:
                return await ctx.reply({
                    content: 'Unknown permissions subcommand.',
                    flags: MessageFlags.Ephemeral
                });
        }
    }

    return await ctx.reply({
        content: 'Unknown admin subcommand group.',
        flags: MessageFlags.Ephemeral
    });
}

async function handleGrantPermission(interaction: ChatInputCommandInteraction, ctx: any) {
    const user = interaction.options.getUser('user', true);
    const permissionId = interaction.options.getString('permission', true);
    const state = interaction.options.getString('state', true) as PermissionState;
    const reason = interaction.options.getString('reason') || 'Manual admin grant';

    try {
        const permission = {
            id: permissionId,
            state,
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            grantedBy: ctx.userId,
            reason
        };

        await permissionRepository.savePermission(user.id, 'user', permission);

        const embed = new EmbedBuilder()
            .setTitle('✅ Permission Granted')
            .setColor(0x00ff00)
            .addFields(
                { name: 'User', value: `<@${user.id}>`, inline: true },
                { name: 'Permission', value: permissionId, inline: true },
                { name: 'State', value: state, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        return await ctx.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        log.error(`Failed to grant permission`, 'AdminCommands', String(error));
        return await ctx.reply({
            content: `Failed to grant permission: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleRevokePermission(interaction: ChatInputCommandInteraction, ctx: any) {
    const user = interaction.options.getUser('user', true);
    const permissionId = interaction.options.getString('permission', true);

    try {
        await permissionRepository.deletePermission(user.id, 'user', permissionId);

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Permission Revoked')
            .setColor(0xff6600)
            .addFields(
                { name: 'User', value: `<@${user.id}>`, inline: true },
                { name: 'Permission', value: permissionId, inline: true }
            )
            .setTimestamp();

        return await ctx.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        log.error(`Failed to revoke permission`, 'AdminCommands', String(error));
        return await ctx.reply({
            content: `Failed to revoke permission: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleListPermissions(interaction: ChatInputCommandInteraction, ctx: any) {
    const user = interaction.options.getUser('user', true);

    try {
        const effectivePermissions = await permissionEvaluator.getEffectivePermissions(user.id, ctx.guildId);
        
        if (Object.keys(effectivePermissions).length === 0) {
            return await ctx.reply({
                content: `<@${user.id}> has no explicit permissions set.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`📋 Permissions for ${user.displayName || user.username}`)
            .setColor(0x0099ff)
            .setTimestamp();

        const permissionList = Object.entries(effectivePermissions)
            .map(([id, state]) => `\`${id}\`: **${state}**`)
            .join('\n');

        if (permissionList.length > 4000) {
            // If too long, split into multiple fields
            const chunks = permissionList.match(/.{1,1000}(?:\n|$)/g) || [];
            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: index === 0 ? 'Permissions' : '\u200b',
                    value: chunk,
                    inline: false
                });
            });
        } else {
            embed.setDescription(permissionList);
        }

        return await ctx.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        log.error(`Failed to list permissions`, 'AdminCommands', String(error));
        return await ctx.reply({
            content: `Failed to list permissions: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handlePendingRequests(interaction: ChatInputCommandInteraction, ctx: any) {
    try {
        const pendingRequests = await ephemeralPermissionManager.getPendingRequests(ctx.guildId);

        if (pendingRequests.length === 0) {
            return await ctx.reply({
                content: '📭 No pending permission requests.',
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📨 Pending Permission Requests')
            .setColor(0xffff00)
            .setTimestamp();

        for (const request of pendingRequests.slice(0, 5)) { // Limit to 5 most recent
            embed.addFields({
                name: `Request ID: ${request.id.slice(0, 8)}...`,
                value: [
                    `**User**: <@${request.requestingUserId}>`,
                    `**Command**: ${request.commandId}`,
                    `**Permission**: ${request.permissionRequest.commandPermission}`,
                    `**Error**: ${request.errorMessage}`,
                    `**Created**: <t:${Math.floor(request.createdAt.getTime() / 1000)}:R>`
                ].join('\n'),
                inline: false
            });
        }

        // Create action buttons for the first request
        const firstRequest = pendingRequests[0];
        const actionRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`perm_approve_once_${firstRequest.id}`)
                    .setLabel('Approve Once')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`perm_approve_forever_${firstRequest.id}`)
                    .setLabel('Approve Forever')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`perm_deny_${firstRequest.id}`)
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`perm_silence_${firstRequest.id}`)
                    .setLabel('Silence')
                    .setStyle(ButtonStyle.Secondary)
            );

        if (pendingRequests.length > 5) {
            embed.setFooter({ text: `Showing 5 of ${pendingRequests.length} pending requests` });
        }

        return await ctx.reply({ 
            embeds: [embed], 
            components: [actionRow],
            flags: MessageFlags.Ephemeral 
        });
    } catch (error) {
        log.error(`Failed to get pending requests`, 'AdminCommands', String(error));
        return await ctx.reply({
            content: `Failed to get pending requests: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleAuditLog(interaction: ChatInputCommandInteraction, ctx: any) {
    // TODO: Implement audit log functionality
    return await ctx.reply({
        content: '📋 Audit log functionality is not yet implemented.',
        flags: MessageFlags.Ephemeral
    });
}

// Handle button interactions for permission requests
export async function handlePermissionButtons(interaction: any) {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith('perm_')) return;

    const [, action, requestId] = customId.split('_', 3);
    const fullRequestId = requestId; // In real implementation, you'd need to reconstruct the full ID

    try {
        await ephemeralPermissionManager.respondToRequest(
            fullRequestId,
            interaction.user.id,
            action as 'approve_once' | 'approve_forever' | 'deny' | 'silence'
        );

        const actionLabels = {
            'approve': 'approved',
            'deny': 'denied',
            'silence': 'silenced'
        };

        const actionType = action.startsWith('approve') ? 'approve' : action;
        const label = actionLabels[actionType as keyof typeof actionLabels] || action;

        await interaction.update({
            content: `✅ Permission request ${label} by <@${interaction.user.id}>`,
            embeds: [],
            components: []
        });
    } catch (error) {
        await interaction.reply({
            content: `Failed to respond to permission request: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}