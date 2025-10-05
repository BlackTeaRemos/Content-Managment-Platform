import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    MessageFlags,
} from 'discord.js';
import { flowManager } from '../Common/Flow/Manager.js';
import { executeWithContext } from '../Common/ExecutionContextHelpers.js';
import { getSupportedTypes, listRecordsFor, buildEmbedFor } from '../Common/Flow/ObjectRegistry.js';
import { neo4jClient } from '../Setup/Neo4j.js';

export const data = new SlashCommandBuilder().setName('view').setDescription('Interactive view of stored objects');

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
        const v = (o.value ?? '').toString();
        if (!v) continue; // skip empty values
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(o);
        if (out.length >= max) break;
    }
    return out;
}

export async function execute(interaction: ChatInputCommandInteraction) {
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        await flowManager
            .builder(interaction.user.id, interaction, {} as State, executionContext)
            .step('select_type')
            .prompt(async (ctx: any) => {
                const options = uniqueSelectOptions(getSupportedTypes());
                const select = new StringSelectMenuBuilder()
                    .setCustomId('select_type')
                    .setPlaceholder('Select object type')
                    .addOptions(options);
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                await interaction.editReply({
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                });
            })
            .onInteraction(async (ctx: any, interaction: any) => {
                if (!interaction.isStringSelectMenu()) return false;
                ctx.state.type = interaction.values[0];
                await interaction.deferUpdate();
                return true;
            })
            .next()
            .step('select_object')
            .prompt(async (ctx: any) => {
                const type = ctx.state.type!;
                const records = await listRecordsFor(type as any);
                const options = uniqueSelectOptions(
                    records.map(r => ({ label: r.label.toString().slice(0, 50), value: r.uid.toString() })),
                );
                const select = new StringSelectMenuBuilder()
                    .setCustomId('select_object')
                    .setPlaceholder('Select object to view')
                    .addOptions(options);
                // Update existing ephemeral reply with new select menu for object selection
                await interaction.editReply({
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                });
            })
            .onInteraction(async (ctx: any, interaction: any) => {
                if (!interaction.isStringSelectMenu()) return false;
                ctx.state.id = interaction.values[0];
                await interaction.deferUpdate();
                return true;
            })
            .next()
            .step('select_view_org')
            .prompt(async (ctx: any) => {
                // For objects that support descriptions, select organization per rules
                const describable = ['game', 'organization', 'user', 'building'];
                if (!describable.includes(ctx.state.type)) {
                    await ctx.advance();
                    return;
                }
                const session = await neo4jClient.GetSession('READ');
                try {
                    const res = await session.run(
                        'MATCH (u:User { discord_id: $discordId })-[:BELONGS_TO]->(o:Organization) RETURN o.uid AS uid, o.name AS name',
                        { discordId: (interaction as ChatInputCommandInteraction).user.id },
                    );
                    const orgs = res.records.map((r: any) => ({
                        uid: String(r.get('uid')),
                        name: String(r.get('name')),
                    }));
                    if (orgs.length === 0) {
                        // No orgs: use public/general later by passing empty orgUid
                        ctx.state.orgUid = '';
                        await ctx.advance();
                        return;
                    }
                    if (orgs.length === 1) {
                        ctx.state.orgUid = orgs[0].uid;
                        await ctx.advance();
                        return;
                    }
                    const orgOptions: Array<{ label: string; value: string }> = uniqueSelectOptions(
                        orgs.map((o: { uid: string; name: string }) => ({ label: o.name.slice(0, 50), value: o.uid })),
                    );
                    const select = new StringSelectMenuBuilder()
                        .setCustomId('select_view_org')
                        .setPlaceholder('Select organization context for description')
                        .addOptions(orgOptions);
                    await (interaction as ChatInputCommandInteraction).editReply({
                        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                    });
                } finally {
                    await session.close();
                }
            })
            .onInteraction(async (ctx: any, interaction: any) => {
                if (!interaction.isStringSelectMenu()) return false;
                ctx.state.orgUid = interaction.values[0];
                await interaction.deferUpdate();
                return true;
            })
            .next()
            .step('show_details')
            .prompt(async (ctx: any) => {
                const type = ctx.state.type!;
                const id = ctx.state.id!;
                const embed = await buildEmbedFor(type as any, id, ctx.state.orgUid);
                await (interaction as ChatInputCommandInteraction).followUp({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            })
            .next()
            .start();
    });
}
