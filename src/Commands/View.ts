import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js';
import { flowManager } from '../Common/Flow/Manager.js';
import { executeWithContext } from '../Common/ExecutionContextHelpers.js';
import { getSupportedTypes } from '../Common/Flow/ObjectRegistry.js';
import { neo4jClient } from '../Setup/Neo4j.js';
import { log } from '../Common/Log.js';
import { getGame } from '../Flow/Object/Game/View.js';
import { resolveViewPermissions } from '../Flow/Command/ViewFlow.js';
import { requestPermissionFromAdmin } from '../SubCommand/Permission/PermissionUI.js';
import { grantForever } from '../Common/permission/index.js';

export const data = new SlashCommandBuilder().setName(`view`).setDescription(`Interactive view of stored objects`);
export const permissionTokens = `command:view`;

interface State {
    type?: string;
    id?: string;
    orgUid?: string; // selected organization for description context
}

// Ensure select menu options have unique values and fit Discord constraints
function uniqueSelectOptions<T extends { value: string }>(options: T[], max = 25): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const o of options) {
        const v = (o.value ?? ``).toString();
        if (!v) {
            continue;
        } // skip empty values
        if (seen.has(v)) {
            continue;
        }
        seen.add(v);
        out.push(o);
        if (out.length >= max) {
            break;
        }
    }
    return out;
}

export async function execute(interaction: ChatInputCommandInteraction) {
    await executeWithContext(interaction, async(flowManager, executionContext) => {
        await flowManager
            .builder(interaction.user.id, interaction, {} as State, executionContext)
            .step(`select_type`)
            .prompt(async(ctx: any) => {
                const options = uniqueSelectOptions(getSupportedTypes());
                const select = new StringSelectMenuBuilder()
                    .setCustomId(`select_type`)
                    .setPlaceholder(`Select object type`)
                    .addOptions(options);
                await (ctx.interaction as ChatInputCommandInteraction).deferReply({ flags: MessageFlags.Ephemeral });
                await (ctx.interaction as ChatInputCommandInteraction).editReply({
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                });
            })
            .onInteraction(async(ctx: any, interaction: any) => {
                if (!interaction.isStringSelectMenu()) {
                    return false;
                }
                ctx.state.type = interaction.values[0];
                await interaction.deferUpdate();
                return true;
            })
            .next()
            .step(`select_object`)
            .prompt(async(ctx: any) => {
                const type = ctx.state.type!;

                let records: Array<{ uid: string; label: string }> = [];
                const session = await neo4jClient.GetSession(`READ`);
                try {
                    const queryMap: Record<string, string> = {
                        game: `MATCH (g:Game) RETURN g.uid AS uid, g.name AS label`,
                        organization: `MATCH (o:Organization) RETURN o.uid AS uid, o.name AS label`,
                        user: `MATCH (u:User) RETURN u.uid AS uid, u.discord_id AS label`,
                        building: `MATCH (f:Factory) RETURN f.uid AS uid, f.type AS label`,
                        description: `MATCH (d:Description) RETURN d.uid AS uid, d.text AS label`,
                    };
                    const result = await session.run(queryMap[type]);
                    records = result.records.map(r => {
                        return { uid: r.get(`uid`), label: r.get(`label`) };
                    });
                } finally {
                    await session.close();
                }
                const options = records.map(r => {
                    return { label: r.label.toString().slice(0, 50), value: r.uid.toString() };
                });
                // If there are no options, avoid sending an empty select (Discord rejects it)
                if (options.length === 0) {
                    await (ctx.interaction as ChatInputCommandInteraction).editReply({
                        content: `No ${type} objects found.`,
                        components: [],
                    });
                    return;
                }
                const select = new StringSelectMenuBuilder()
                    .setCustomId(`select_object`)
                    .setPlaceholder(`Select object to view`)
                    .addOptions(options);
                // Update existing ephemeral reply with new select menu for object selection
                try {
                    await (ctx.interaction as ChatInputCommandInteraction).editReply({
                        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                    });
                } catch(err) {
                    log.error(`Failed to editReply for select_object`, String(err), `ViewCommand`);
                    throw err;
                }
            })
            .onInteraction(async(ctx: any, interaction: any) => {
                if (!interaction.isStringSelectMenu()) {
                    return false;
                }
                ctx.state.id = interaction.values[0];
                await interaction.deferUpdate();
                return true;
            })
            .next()
            .step(`select_view_org`)
            .prompt(async(ctx: any) => {
                // For objects that support descriptions, select organization per rules
                const describable = [`game`, `organization`, `user`, `building`];
                if (!describable.includes(ctx.state.type)) {
                    await ctx.advance();
                    return;
                }
                const session = await neo4jClient.GetSession(`READ`);
                try {
                    const res = await session.run(
                        `MATCH (u:User { discord_id: $discordId })-[:BELONGS_TO]->(o:Organization) RETURN o.uid AS uid, o.name AS name`,
                        { discordId: (interaction as ChatInputCommandInteraction).user.id },
                    );
                    const orgs = res.records.map((r: any) => {
                        return {
                            uid: String(r.get(`uid`)),
                            name: String(r.get(`name`)),
                        };
                    });
                    if (orgs.length === 0) {
                        // No orgs: use public/general later by passing empty orgUid
                        ctx.state.orgUid = ``;
                        await ctx.advance();
                        return;
                    }
                    if (orgs.length === 1) {
                        ctx.state.orgUid = orgs[0].uid;
                        await ctx.advance();
                        return;
                    }
                    const orgOptions: Array<{ label: string; value: string }> = uniqueSelectOptions(
                        orgs.map((o: { uid: string; name: string }) => {
                            return { label: o.name.slice(0, 50), value: o.uid };
                        }),
                    );
                    const select = new StringSelectMenuBuilder()
                        .setCustomId(`select_view_org`)
                        .setPlaceholder(`Select organization context for description`)
                        .addOptions(orgOptions);
                    await (interaction as ChatInputCommandInteraction).editReply({
                        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                    });
                } finally {
                    await session.close();
                }
            })
            .onInteraction(async(ctx: any, interaction: any) => {
                if (!interaction.isStringSelectMenu()) {
                    return false;
                }
                ctx.state.orgUid = interaction.values[0];
                await interaction.deferUpdate();
                return true;
            })
            .next()
            .step(`show_details`)
            .prompt(async(ctx: any) => {
                const type = ctx.state.type!;
                const id = ctx.state.id!;
                const baseInteraction = ctx.interaction as ChatInputCommandInteraction;

                const permission = await resolveViewPermissions(baseInteraction, { type, id });
                if (!permission.allowed) {
                    if (permission.requiresApproval) {
                        try {
                            await baseInteraction.deferReply({ ephemeral: true });
                        } catch {}
                        const decision = await requestPermissionFromAdmin(baseInteraction, {
                            tokens: permission.tokens,
                            reason: permission.reason,
                        });
                        if (decision === `approve_forever` && baseInteraction.guildId) {
                            grantForever(baseInteraction.guildId, baseInteraction.user.id, permission.tokens[0] ?? []);
                        }
                        if (decision !== `approve_forever` && decision !== `approve_once`) {
                            await baseInteraction.followUp({
                                content: `Permission denied or no admin response.`,
                                flags: MessageFlags.Ephemeral,
                            });
                            return;
                        }
                        // otherwise continue to show details
                    } else {
                        await baseInteraction.followUp({
                            content: permission.reason ?? `You are not allowed to view this item.`,
                            flags: MessageFlags.Ephemeral,
                        });
                        return;
                    }
                }

                let embed = new EmbedBuilder().setTitle(`Details`).setColor(`Blue`);
                if (type === `game`) {
                    const g = await getGame(id);
                    embed
                        .addFields({ name: `UID`, value: g?.uid ?? `n/a`, inline: true })
                        .addFields({ name: `Name`, value: g?.name ?? `n/a`, inline: true })
                        .addFields({ name: `Server`, value: g?.serverId ?? `n/a`, inline: true });
                } else {
                    embed.setDescription(`Viewing for type ${type} not implemented.`);
                }
                try {
                    await baseInteraction.followUp({
                        embeds: [embed],
                        flags: MessageFlags.Ephemeral,
                    });
                } catch(err) {
                    log.error(`Failed to followUp in show_details`, String(err), `ViewCommand`);
                    throw err;
                }
            })
            .next()
            .start();
    });
}
