import {
    SlashCommandBuilder,
    ActionRowBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    MessageFlags,
} from 'discord.js';
import { flowManager } from '../Flow/FlowManager.js';
import { neo4jClient } from '../Setup/Neo4j.js';
import { getGame } from '../Flow/Object/Game/View.js';
import { executeWithContext } from '../Common/ExecutionContextHelpers.js';
import { log } from '../Common/Log.js';

export const data = new SlashCommandBuilder().setName('view').setDescription('Interactive view of stored objects');

export const permissionTokens = 'view';

interface State {
    type?: string;
    id?: string;
}

export async function execute(interaction: ChatInputCommandInteraction) {
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        await flowManager
            .builder(interaction.user.id, interaction, {} as State, executionContext)
            .step('select_type')
            .prompt(async (ctx: any) => {
                const options = [
                    { label: 'Games', value: 'game' },
                    { label: 'Organizations', value: 'organization' },
                    { label: 'Users', value: 'user' },
                    { label: 'Factories', value: 'building' },
                    { label: 'Descriptions', value: 'description' },
                ];
                const select = new StringSelectMenuBuilder()
                    .setCustomId('select_type')
                    .setPlaceholder('Select object type')
                    .addOptions(options);
                await (ctx.interaction as ChatInputCommandInteraction).deferReply({ flags: MessageFlags.Ephemeral });
                await (ctx.interaction as ChatInputCommandInteraction).editReply({
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
                let records: Array<{ uid: string; label: string }> = [];
                const session = await neo4jClient.GetSession('READ');
                try {
                    const queryMap: Record<string, string> = {
                        game: 'MATCH (g:Game) RETURN g.uid AS uid, g.name AS label',
                        organization: 'MATCH (o:Organization) RETURN o.uid AS uid, o.name AS label',
                        user: 'MATCH (u:User) RETURN u.uid AS uid, u.discord_id AS label',
                        building: 'MATCH (f:Factory) RETURN f.uid AS uid, f.type AS label',
                        description: 'MATCH (d:Description) RETURN d.uid AS uid, d.text AS label',
                    };
                    const result = await session.run(queryMap[type]);
                    records = result.records.map(r => ({ uid: r.get('uid'), label: r.get('label') }));
                } finally {
                    await session.close();
                }
                const options = records.map(r => ({ label: r.label.toString().slice(0, 50), value: r.uid.toString() }));
                // If there are no options, avoid sending an empty select (Discord rejects it)
                if (options.length === 0) {
                    await (ctx.interaction as ChatInputCommandInteraction).editReply({
                        content: `No ${type} objects found.`,
                        components: [],
                    });
                    return;
                }
                const select = new StringSelectMenuBuilder()
                    .setCustomId('select_object')
                    .setPlaceholder('Select object to view')
                    .addOptions(options);
                // Update existing ephemeral reply with new select menu for object selection
                try {
                    await (ctx.interaction as ChatInputCommandInteraction).editReply({
                        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                    });
                } catch (err) {
                    log.error('Failed to editReply for select_object', String(err), 'ViewCommand');
                    throw err;
                }
            })
            .onInteraction(async (ctx: any, interaction: any) => {
                if (!interaction.isStringSelectMenu()) return false;
                ctx.state.id = interaction.values[0];
                await interaction.deferUpdate();
                return true;
            })
            .next()
            .step('show_details')
            .prompt(async (ctx: any) => {
                const type = ctx.state.type!;
                const id = ctx.state.id!;
                let embed = new EmbedBuilder().setTitle('Details').setColor('Blue');
                if (type === 'game') {
                    const g = await getGame(id);
                    embed
                        .addFields({ name: 'UID', value: g?.uid ?? 'n/a', inline: true })
                        .addFields({ name: 'Name', value: g?.name ?? 'n/a', inline: true })
                        .addFields({ name: 'Server', value: g?.serverId ?? 'n/a', inline: true });
                } else {
                    embed.setDescription(`Viewing for type ${type} not implemented.`);
                }
                try {
                    await (ctx.interaction as ChatInputCommandInteraction).followUp({
                        embeds: [embed],
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (err) {
                    log.error('Failed to followUp in show_details', String(err), 'ViewCommand');
                    throw err;
                }
            })
            .next()
            .start();
    });
}
