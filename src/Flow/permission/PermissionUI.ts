import {
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    EmbedBuilder,
    Colors,
} from 'discord.js';
import { grantForever } from './PermissionManager.js';

/**
 * Decision result from admin interaction
 */
export type PermissionDecision = 'approve_once' | 'approve_forever' | 'deny' | 'no_admin' | 'timeout';

/**
 * Send an approval request to a random administrator in the guild and wait for their response.
 * The implementation uses a channel message with action buttons. Only the chosen admin can respond.
 *
 * Note: This is a prototype. In production code this should store requests in DB and use a robust
 * interactive component handler instead of an in-memory collector.
 */
export async function requestPermissionFromAdmin(
    interaction: ChatInputCommandInteraction,
    options: { tokens: string[]; reason?: string },
    timeoutMs = 5 * 60 * 1000,
): Promise<PermissionDecision> {
    const guild = interaction.guild;
    if (!guild) return 'no_admin';

    // Fetch all members and find administrators (exclude bots)
    const members = await guild.members.fetch();
    const admins = members.filter(m => !m.user.bot && m.permissions.has(PermissionsBitField.Flags.Administrator));

    if (!admins || admins.size === 0) {
        return 'no_admin';
    }

    // Pick a random admin
    const adminArray = Array.from(admins.values());
    const admin = adminArray[Math.floor(Math.random() * adminArray.length)];

    // Build message
    const tokensStr = options.tokens.join(', ');
    const embed = new EmbedBuilder()
        .setTitle('Permission request')
        .setColor(Colors.Orange)
        .setDescription(`User <@${interaction.user.id}> requested to run command(s): ${tokensStr}`)
        .addFields([{ name: 'Reason', value: options.reason || 'No reason provided' }]);

    const approveOnceBtn = new ButtonBuilder()
        .setCustomId('perm_approve_once')
        .setLabel('Approve once')
        .setStyle(ButtonStyle.Primary);
    const approveForeverBtn = new ButtonBuilder()
        .setCustomId('perm_approve_forever')
        .setLabel('Approve forever')
        .setStyle(ButtonStyle.Success);
    const denyBtn = new ButtonBuilder().setCustomId('perm_deny').setLabel('Deny').setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveOnceBtn, approveForeverBtn, denyBtn);

    // Send a message in the same channel to ping the admin so they see it in-context
    let msg;
    try {
        // Try channel first (some channel types may not expose send in typings)
        msg = await (interaction.channel as any).send({ content: `${admin}`, embeds: [embed], components: [row] });
    } catch (err) {
        try {
            // Fallback to DM the selected admin
            msg = await admin.send({
                content: `Permission request from ${interaction.user.tag}`,
                embeds: [embed],
                components: [row],
            });
        } catch (err2) {
            return 'no_admin';
        }
    }

    // Wait for button from the selected admin
    try {
        const filter = (i: any) => i.user.id === admin.id && i.message.id === msg.id;
        const collected = await msg.awaitMessageComponent({ filter, time: timeoutMs });

        await collected.deferUpdate();

        const id = collected.customId;
        if (id === 'perm_approve_once') {
            return 'approve_once';
        }
        if (id === 'perm_approve_forever') {
            // Persist in-memory grant for now
            grantForever(guild.id, interaction.user.id, options.tokens[0] ?? 'unknown');
            return 'approve_forever';
        }
        return 'deny';
    } catch (err) {
        // Timeout or other error
        try {
            await msg.edit({ content: `${admin} (no response)`, components: [] });
        } catch {}
        return 'timeout';
    }
}
