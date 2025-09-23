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

export const data = new SlashCommandBuilder().setName('view').setDescription('Interactive view of stored objects');

interface State {
    type?: string;
    id?: string;
}

export async function execute(interaction: ChatInputCommandInteraction) {
    await flowManager
        .builder(interaction.user.id, interaction, {} as State)
        .step('select_type')
        .prompt(async ctx => {
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
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await interaction.editReply({
                components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
            });
        })
        .onInteraction(async (ctx, interaction) => {
            if (!interaction.isStringSelectMenu()) return false;
            ctx.state.type = interaction.values[0];
            await interaction.deferUpdate();
            return true;
        })
        .next()
        .step('select_object')
        .prompt(async ctx => {
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
            const select = new StringSelectMenuBuilder()
                .setCustomId('select_object')
                .setPlaceholder('Select object to view')
                .addOptions(options);
            // Update existing ephemeral reply with new select menu for object selection
            await interaction.editReply({
                components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
            });
        })
        .onInteraction(async (ctx, interaction) => {
            if (!interaction.isStringSelectMenu()) return false;
            ctx.state.id = interaction.values[0];
            await interaction.deferUpdate();
            return true;
        })
        .next()
        .step('show_details')
        .prompt(async ctx => {
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
            await (interaction as ChatInputCommandInteraction).followUp({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        })
        .next()
        .start();
}
