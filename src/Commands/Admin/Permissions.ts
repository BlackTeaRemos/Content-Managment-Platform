import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction, 
    MessageFlags,
    EmbedBuilder 
} from 'discord.js';
import { createCommandContext } from '../../Common/ExecutionContextHelpers.js';
import { PermissionService } from '../../Services/PermissionService.js';
import { InMemoryPermissionRepository } from '../../Repository/InMemoryPermissionRepository.js';
import { PermissionLevel, PermissionState } from '../../Domain/Permission.js';
import { log } from '../../Common/Log.js';

// Create a singleton instance for now (should be dependency injected in production)
const permissionRepository = new InMemoryPermissionRepository();
const permissionService = new PermissionService(permissionRepository);

export const data = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administrative commands')
    .addSubcommandGroup(group => 
        group
            .setName('permissions')
            .setDescription('Manage user permissions')
            .addSubcommand(sub => 
                sub
                    .setName('grant')
                    .setDescription('Grant permission to a user')
                    .addUserOption(option => 
                        option
                            .setName('user')
                            .setDescription('User to grant permission to')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('tags')
                            .setDescription('Comma-separated list of permission tags')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('state')
                            .setDescription('Permission state')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Allowed', value: 'allowed' },
                                { name: 'Forbidden', value: 'forbidden' },
                                { name: 'Once', value: 'once' }
                            ))
                    .addStringOption(option =>
                        option
                            .setName('level')
                            .setDescription('Permission level')
                            .setRequired(false)
                            .addChoices(
                                { name: 'User', value: 'user' },
                                { name: 'Organization', value: 'organization' },
                                { name: 'Server', value: 'server' }
                            ))
                    .addStringOption(option =>
                        option
                            .setName('reason')
                            .setDescription('Reason for granting this permission')
                            .setRequired(false)))
            .addSubcommand(sub => 
                sub
                    .setName('revoke')
                    .setDescription('Revoke permission from a user')
                    .addUserOption(option => 
                        option
                            .setName('user')
                            .setDescription('User to revoke permission from')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('tags')
                            .setDescription('Comma-separated list of permission tags')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('level')
                            .setDescription('Permission level')
                            .setRequired(false)
                            .addChoices(
                                { name: 'User', value: 'user' },
                                { name: 'Organization', value: 'organization' },
                                { name: 'Server', value: 'server' }
                            )))
            .addSubcommand(sub => 
                sub
                    .setName('list')
                    .setDescription('List permissions for a user')
                    .addUserOption(option => 
                        option
                            .setName('user')
                            .setDescription('User to list permissions for')
                            .setRequired(true)))
            .addSubcommand(sub => 
                sub
                    .setName('check')
                    .setDescription('Check if a user has specific permissions')
                    .addUserOption(option => 
                        option
                            .setName('user')
                            .setDescription('User to check permissions for')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('tags')
                            .setDescription('Comma-separated list of permission tags to check')
                            .setRequired(true))));

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    // Check if user is admin (basic check - in production this should be more robust)
    const isAdmin = await permissionService.isAdmin(interaction.user.id, interaction.guildId || '');
    if (!isAdmin) {
        return ctx.reply({
            content: '❌ You need administrator permissions to use this command.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (subcommandGroup === 'permissions') {
        switch (subcommand) {
            case 'grant':
                return handlePermissionGrant(interaction, ctx);
            case 'revoke':
                return handlePermissionRevoke(interaction, ctx);
            case 'list':
                return handlePermissionList(interaction, ctx);
            case 'check':
                return handlePermissionCheck(interaction, ctx);
            default:
                return ctx.reply({
                    content: '❌ Unknown permissions subcommand.',
                    flags: MessageFlags.Ephemeral
                });
        }
    }

    return ctx.reply({
        content: '❌ Unknown admin subcommand group.',
        flags: MessageFlags.Ephemeral
    });
}

async function handlePermissionGrant(interaction: ChatInputCommandInteraction, ctx: any) {
    const user = interaction.options.getUser('user', true);
    const tagsString = interaction.options.getString('tags', true);
    const state = interaction.options.getString('state', true) as PermissionState;
    const level = interaction.options.getString('level') as PermissionLevel || 'user';
    const reason = interaction.options.getString('reason');

    const tags = tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);

    if (tags.length === 0) {
        return ctx.reply({
            content: '❌ No valid tags provided.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        await permissionService.grant(
            level,
            { userId: user.id, guildId: interaction.guildId || '' },
            tags,
            state,
            interaction.user.id,
            reason || undefined
        );

        const embed = new EmbedBuilder()
            .setTitle('✅ Permission Granted')
            .setColor(0x00FF00)
            .addFields(
                { name: 'User', value: `<@${user.id}>`, inline: true },
                { name: 'Level', value: level, inline: true },
                { name: 'State', value: state, inline: true },
                { name: 'Tags', value: tags.join(', '), inline: false }
            );

        if (reason) {
            embed.addFields({ name: 'Reason', value: reason, inline: false });
        }

        return ctx.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        log.error(`Failed to grant permission: ${error}`, 'AdminPermissions');
        return ctx.reply({
            content: `❌ Failed to grant permission: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handlePermissionRevoke(interaction: ChatInputCommandInteraction, ctx: any) {
    const user = interaction.options.getUser('user', true);
    const tagsString = interaction.options.getString('tags', true);
    const level = interaction.options.getString('level') as PermissionLevel || 'user';

    const tags = tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);

    if (tags.length === 0) {
        return ctx.reply({
            content: '❌ No valid tags provided.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        await permissionService.revoke(
            level,
            { userId: user.id, guildId: interaction.guildId || '' },
            tags
        );

        const embed = new EmbedBuilder()
            .setTitle('✅ Permission Revoked')
            .setColor(0xFFAA00)
            .addFields(
                { name: 'User', value: `<@${user.id}>`, inline: true },
                { name: 'Level', value: level, inline: true },
                { name: 'Tags', value: tags.join(', '), inline: false }
            );

        return ctx.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        log.error(`Failed to revoke permission: ${error}`, 'AdminPermissions');
        return ctx.reply({
            content: `❌ Failed to revoke permission: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handlePermissionList(interaction: ChatInputCommandInteraction, ctx: any) {
    const user = interaction.options.getUser('user', true);
    const guildId = interaction.guildId || '';

    try {
        const levels: PermissionLevel[] = ['admin', 'user', 'organization', 'server'];
        const embed = new EmbedBuilder()
            .setTitle(`🔍 Permissions for ${user.displayName || user.username}`)
            .setColor(0x0099FF);

        let hasPermissions = false;

        for (const level of levels) {
            const permissionSet = await permissionRepository.getPermissionSet(level, {
                userId: user.id,
                guildId: guildId
            });

            if (permissionSet && permissionSet.permissions.length > 0) {
                hasPermissions = true;
                const permissionList = permissionSet.permissions
                    .map(p => `• \`${p.tag}\` (${p.state})${p.reason ? ` - ${p.reason}` : ''}`)
                    .join('\n');
                
                embed.addFields({
                    name: `${level.charAt(0).toUpperCase() + level.slice(1)} Level`,
                    value: permissionList,
                    inline: false
                });
            }
        }

        if (!hasPermissions) {
            embed.setDescription('No explicit permissions found for this user.');
        }

        return ctx.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        log.error(`Failed to list permissions: ${error}`, 'AdminPermissions');
        return ctx.reply({
            content: `❌ Failed to list permissions: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handlePermissionCheck(interaction: ChatInputCommandInteraction, ctx: any) {
    const user = interaction.options.getUser('user', true);
    const tagsString = interaction.options.getString('tags', true);
    const guildId = interaction.guildId || '';

    const tags = tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);

    if (tags.length === 0) {
        return ctx.reply({
            content: '❌ No valid tags provided.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const result = await permissionService.evaluate({
            userId: user.id,
            guildId: guildId,
            requiredTags: tags
        });

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Permission Check for ${user.displayName || user.username}`)
            .setColor(result.allowed ? 0x00FF00 : 0xFF0000)
            .addFields(
                { name: 'Result', value: result.allowed ? '✅ Allowed' : '❌ Denied', inline: true },
                { name: 'Level', value: result.level, inline: true },
                { name: 'Tags Checked', value: tags.join(', '), inline: false }
            );

        if (result.missingTags.length > 0) {
            embed.addFields({ name: 'Missing Tags', value: result.missingTags.join(', '), inline: false });
        }

        if (result.reasons.length > 0) {
            embed.addFields({ name: 'Reasons', value: result.reasons.join('\n'), inline: false });
        }

        return ctx.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        log.error(`Failed to check permissions: ${error}`, 'AdminPermissions');
        return ctx.reply({
            content: `❌ Failed to check permissions: ${error instanceof Error ? error.message : String(error)}`,
            flags: MessageFlags.Ephemeral
        });
    }
}