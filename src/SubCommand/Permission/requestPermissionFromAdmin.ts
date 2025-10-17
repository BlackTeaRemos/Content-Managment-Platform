import {
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    EmbedBuilder,
    Colors,
} from 'discord.js';
import type { Guild, GuildMember } from 'discord.js';
import {
    formatPermissionToken,
    grantForever,
    type PermissionDecision,
    type PermissionToken,
} from '../../Common/permission/index.js';
import { log } from '../../Common/Log.js';
import { loadResolverMembers } from '../../Flow/permission/loadResolverMembers.js';

/**
 * Send an approval request to a random administrator in the guild and wait for their response.
 * The implementation uses a channel message with action buttons. Only the chosen admin can respond.
 *
 * Note: This is a prototype. In production code this should store requests in DB and use a robust
 * interactive component handler instead of an in-memory collector.
 */
export async function requestPermissionFromAdmin(
    interaction: ChatInputCommandInteraction,
    options: { tokens: PermissionToken[]; reason?: string },
    timeoutMs = 5 * 60 * 1000,
): Promise<PermissionDecision> {
    log.info(
        `Permission request: invoked for user ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guild?.id ?? `none`}`,
        `PermissionUI`,
    );
    // Defer the interaction immediately to prevent "application didn't respond" error
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }
    } catch (err) {
        // Already deferred/replied, continue
    }

    const guild = interaction.guild;
    if (!guild) {
        return `no_admin`;
    }

    const resolverCandidates = await loadResolverMembers(guild);
    let approvers: GuildMember[] = [];

    if (resolverCandidates.length) {
        approvers = resolverCandidates;
        log.info(
            `Permission request: using ${resolverCandidates.length} resolver candidate(s) from DB for guild ${guild.id}`,
            `PermissionUI`,
        );
    } else {
        let members;
        try {
            members = await guild.members.fetch();
        } catch (err) {
            // This often fails when the bot lacks GUILD_MEMBERS intent or member cache isn't available
            log.error(`Permission request: failed to fetch guild members: ${String(err)}`, `PermissionUI`);
            return `no_admin`;
        }
        const admins = members.filter(m => {
            return !m.user.bot && m.permissions.has(PermissionsBitField.Flags.Administrator);
        });

        log.info(`Permission request: found ${admins.size} admins in guild ${guild.id}`, `PermissionUI`);

        if (!admins || admins.size === 0) {
            log.warning(`Permission request: no admins found in guild ${guild.id}`, `PermissionUI`);
            return `no_admin`;
        }

        approvers = Array.from(admins.values());
    }

    if (!approvers.length) {
        log.warning(`Permission request: no approvers available for guild ${guild.id}`, `PermissionUI`);
        return `no_admin`;
    }

    const approver = approvers[Math.floor(Math.random() * approvers.length)];
    log.info(`Permission request: selected approver ${approver.user.tag} (${approver.id})`, `PermissionUI`);

    // Build message
    const tokensStr = options.tokens.map(formatPermissionToken).join(`, `);
    const embed = new EmbedBuilder()
        .setTitle(`Permission request`)
        .setColor(Colors.Orange)
        .setDescription(`User <@${interaction.user.id}> requested to run command(s): ${tokensStr}`)
        .addFields([{ name: `Reason`, value: options.reason || `No reason provided` }]);

    const approveOnceBtn = new ButtonBuilder()
        .setCustomId(`perm_approve_once`)
        .setLabel(`Approve once`)
        .setStyle(ButtonStyle.Primary);
    const approveForeverBtn = new ButtonBuilder()
        .setCustomId(`perm_approve_forever`)
        .setLabel(`Approve forever`)
        .setStyle(ButtonStyle.Success);
    const denyBtn = new ButtonBuilder().setCustomId(`perm_deny`).setLabel(`Deny`).setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveOnceBtn, approveForeverBtn, denyBtn);

    // Send a message in the same channel to ping the admin so they see it in-context
    let msg;
    try {
        // Try channel first (some channel types may not expose send in typings)
        log.info(`Permission request: attempting to send in channel ${interaction.channel?.id}`, `PermissionUI`);
        msg = await (interaction.channel as any).send({ content: `${approver}`, embeds: [embed], components: [row] });
        log.info(`Permission request: sent in channel, message ${msg.id}`, `PermissionUI`);
    } catch (err) {
        log.warning(`Permission request: channel send failed, trying DM: ${String(err)}`, `PermissionUI`);
        try {
            // Fallback to DM the selected admin
            msg = await approver.send({
                content: `Permission request from ${interaction.user.tag}`,
                embeds: [embed],
                components: [row],
            });
            log.info(`Permission request: sent via DM, message ${msg.id}`, `PermissionUI`);
        } catch (err2) {
            log.error(`Permission request: both channel and DM send failed: ${String(err2)}`, `PermissionUI`);
            return `no_admin`;
        }
    }

    // Wait for button from the selected admin
    try {
        const filter = (i: any) => {
            return i.user.id === approver.id && i.message.id === msg.id;
        };
        log.info(
            `Permission request: awaiting response from ${approver.user.tag} for message ${msg.id}`,
            `PermissionUI`,
        );
        const collected = await msg.awaitMessageComponent({ filter, time: timeoutMs });

        log.info(
            `Permission request: collected component ${collected.customId} from ${collected.user.tag}`,
            `PermissionUI`,
        );
        await collected.deferUpdate();

        const id = collected.customId;
        const decision =
            id === `perm_approve_once` ? `approve_once` : id === `perm_approve_forever` ? `approve_forever` : `deny`;

        if (id === `perm_approve_forever`) {
            log.info(
                `Permission request: persisting forever grant for ${interaction.user.id} by ${approver.id}`,
                `PermissionUI`,
            );
            grantForever(guild.id, interaction.user.id, options.tokens[0] ?? `unknown`);
        }

        try {
            await interaction.editReply({
                content: `Permission ${decision === `approve_once` ? `approved (once)` : decision === `approve_forever` ? `approved (forever)` : `denied`}.`,
            });
        } catch (err) {
            log.warning(
                `Permission request: failed editing original interaction reply: ${String(err)}`,
                `PermissionUI`,
            );
        }

        return decision;
    } catch (err) {
        // Timeout or other error
        log.warning(`Permission request: awaitMessageComponent failed or timed out: ${String(err)}`, `PermissionUI`);
        try {
            await msg.edit({ content: `${approver} (no response)`, components: [] });
            log.info(`Permission request: updated message ${msg.id} to no-response state`, `PermissionUI`);
        } catch (e) {
            log.warning(`Permission request: failed to update message after timeout: ${String(e)}`, `PermissionUI`);
        }
        try {
            await interaction.editReply({ content: `Permission request timed out.` });
        } catch (e) {
            log.warning(
                `Permission request: failed to edit original interaction reply after timeout: ${String(e)}`,
                `PermissionUI`,
            );
        }
        return `timeout`;
    }
}
