import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    MessageFlags,
    EmbedBuilder,
    StringSelectMenuInteraction,
    Interaction,
    Message,
    ModalSubmitInteraction,
} from 'discord.js';
import { executeWithContext } from '../../Common/ExecutionContextHelpers.js';
import { flowManager } from '../../Common/Flow/Manager.js';
import type { StepContext } from '../../Common/Flow/Types.js';
import { neo4jClient } from '../../Setup/Neo4j.js';
import { getLatestDescription } from '../../Flow/Object/Description/Latest.js';
import { createDescriptionVersion } from '../../Flow/Object/Description/Update.js';

interface State {
    targetType?: 'organization' | 'game' | 'user';
    targetUid?: string;
    orgUid?: string;
    latestText?: string;
    latestVersion?: number;
    isPublic?: boolean;
    editMode?: 'append' | 'remove' | 'replace';
    editText?: string;
}

type DescriptionStepContext = StepContext<State>;

// Ensure select menu options have unique values and fit Discord constraints
function uniqueSelectOptions<T extends { value: string }>(options: T[], max = 25): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const o of options) {
        const v = (o.value ?? '').toString();
        if (!v) continue;
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(o);
        if (out.length >= max) break;
    }
    return out;
}

export const data = new SlashCommandBuilder()
    .setName('description')
    .setDescription('Work with descriptions')
    .addSubcommand(s => s.setName('create').setDescription('Create or edit description for an object'));

export async function execute(interaction: ChatInputCommandInteraction) {
    // We support only subcommand 'create' for now
    const sub = interaction.options.getSubcommand();
    if (sub !== 'create') {
        await interaction.reply({ content: 'Unsupported subcommand', flags: MessageFlags.Ephemeral });
        return;
    }

    await executeWithContext(interaction, async (fm, executionContext) => {
        await flowManager
            .builder(interaction.user.id, interaction, {} as State, executionContext)
            // Step 1: select target type
            .step('desc_select_type')
            .prompt(async (ctx: DescriptionStepContext) => {
                const select = new StringSelectMenuBuilder()
                    .setCustomId('desc_select_type')
                    .setPlaceholder('Select object type to describe')
                    .addOptions([
                        { label: 'Organization', value: 'organization' },
                        { label: 'Game', value: 'game' },
                        { label: 'User', value: 'user' },
                    ]);
                await interaction.reply({
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                    flags: MessageFlags.Ephemeral,
                });
            })
            .onInteraction(async (ctx: DescriptionStepContext, i: Interaction) => {
                if (!i.isStringSelectMenu()) return false;
                ctx.state.targetType = i.values[0] as State['targetType'];
                await i.deferUpdate();
                return true;
            })
            .next()
            // Step 2: select specific target object
            .step('desc_select_object')
            .prompt(async ctx => {
                const type = ctx.state.targetType as State['targetType'];
                const session = await neo4jClient.GetSession('READ');
                try {
                    const map: Record<string, { q: string; label: string }> = {
                        organization: {
                            q: 'MATCH (o:Organization) RETURN o.uid AS uid, o.name AS label',
                            label: 'organization',
                        },
                        game: { q: 'MATCH (g:Game) RETURN g.uid AS uid, g.name AS label', label: 'game' },
                        user: { q: 'MATCH (u:User) RETURN u.uid AS uid, u.discord_id AS label', label: 'user' },
                    };
                    const res = await session.run(map[type!].q);
                    const options = uniqueSelectOptions(
                        res.records.map(r => ({
                            label: String(r.get('label')).slice(0, 50),
                            value: String(r.get('uid')),
                        })),
                    );
                    const select = new StringSelectMenuBuilder()
                        .setCustomId('desc_select_object')
                        .setPlaceholder(`Select ${map[type!].label}`)
                        .addOptions(options);
                    await interaction.editReply({
                        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                    });
                } finally {
                    await session.close();
                }
            })
            .onInteraction(async (ctx: any, i: any) => {
                if (!i.isStringSelectMenu()) return false;
                ctx.state.targetUid = i.values[0];
                await i.deferUpdate();
                return true;
            })
            .next()
            // Step 3: select organization (auto/cancel per rules)
            .step('desc_select_org')
            .prompt(async ctx => {
                const session = await neo4jClient.GetSession('READ');
                try {
                    const res = await session.run(
                        'MATCH (u:User { discord_id: $discordId })-[:BELONGS_TO]->(o:Organization) RETURN o.uid AS uid, o.name AS name',
                        { discordId: interaction.user.id },
                    );
                    const orgs = res.records.map(r => ({ uid: String(r.get('uid')), name: String(r.get('name')) }));
                    if (orgs.length === 0) {
                        await interaction.followUp({
                            content: 'You do not belong to any organization. Description creation cancelled.',
                            flags: MessageFlags.Ephemeral,
                        });
                        await ctx.cancel();
                        return;
                    }
                    if (orgs.length === 1) {
                        ctx.state.orgUid = orgs[0].uid;
                        await ctx.advance();
                        return;
                    }
                    const select = new StringSelectMenuBuilder()
                        .setCustomId('desc_select_org')
                        .setPlaceholder('Select organization for this description')
                        .addOptions(uniqueSelectOptions(orgs.map(o => ({ label: o.name.slice(0, 50), value: o.uid }))));
                    await interaction.editReply({
                        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                    });
                } finally {
                    await session.close();
                }
            })
            .onInteraction(async (ctx: any, i: any) => {
                if (!i.isStringSelectMenu()) return false;
                ctx.state.orgUid = i.values[0];
                await i.deferUpdate();
                return true;
            })
            .next()
            // Step 4: show menu with latest description
            .step('desc_menu')
            .prompt(async ctx => {
                const { targetType, targetUid, orgUid } = ctx.state as State;
                const latest = await getLatestDescription(targetType!, targetUid!, orgUid!);
                ctx.state.latestText = latest?.text ?? '';
                ctx.state.latestVersion = latest?.version ?? 0;
                ctx.state.isPublic = latest?.isPublic ?? false;

                const embeds = buildDescriptionEmbeds(
                    ctx.state.latestText || '',
                    ctx.state.latestVersion!,
                    ctx.state.isPublic!,
                );
                const menu = new StringSelectMenuBuilder()
                    .setCustomId('desc_menu')
                    .setPlaceholder('Choose an action')
                    .addOptions([
                        { label: 'Edit', value: 'edit' },
                        { label: 'Select version', value: 'version' },
                        { label: 'Load as txt file', value: 'load_txt' },
                        {
                            label: ctx.state.isPublic ? 'Make private' : 'Generalize (make public)',
                            value: 'toggle_public',
                        },
                        { label: 'Exit', value: 'exit' },
                    ]);
                await interaction.followUp({
                    embeds,
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
                    flags: MessageFlags.Ephemeral,
                });
            })
            .onInteraction(async (ctx: any, i: any) => {
                if (!i.isStringSelectMenu()) return false;
                const choice = i.values[0];
                await i.deferUpdate();
                switch (choice) {
                    case 'edit':
                        return true; // advance to edit mode step
                    case 'version':
                        ctx.state.__next = 'version';
                        return true; // advance to version select
                    case 'load_txt':
                        ctx.state.__next = 'load_txt';
                        return true; // advance to upload step
                    case 'toggle_public':
                        ctx.state.__next = 'toggle_public';
                        return true;
                    case 'exit':
                        await (ctx as any).cancel();
                        return false;
                }
                return false;
            })
            .next()
            // Step 5a: edit mode selection
            .step('desc_edit_mode')
            .prompt(async ctx => {
                // If redirected to other branches, skip appropriately
                if ((ctx.state as any).__next && (ctx.state as any).__next !== 'edit') {
                    await ctx.advance();
                    return;
                }
                const select = new StringSelectMenuBuilder()
                    .setCustomId('desc_edit_mode')
                    .setPlaceholder('Select edit mode')
                    .addOptions([
                        { label: 'Replace (default)', value: 'replace' },
                        { label: 'Append', value: 'append' },
                        { label: 'Remove', value: 'remove' },
                    ]);
                await interaction.followUp({
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                    flags: MessageFlags.Ephemeral,
                });
            })
            .onInteraction(async (ctx: any, i: any) => {
                if (!i.isStringSelectMenu()) return false;
                ctx.state.editMode = i.values[0];
                await i.deferUpdate();
                return true;
            })
            .next()
            // Step 5b: handle redirects from menu: version selection, load txt, toggle public
            // For version selection, customId must match the select component's customId
            .step('desc_select_version')
            .prompt(async ctx => {
                const branch = (ctx.state as any).__next;
                if (branch === 'version') {
                    // show version selector
                    const versions = await listVersions(ctx.state.targetType!, ctx.state.targetUid!, ctx.state.orgUid!);
                    const versionOptions = uniqueSelectOptions(
                        versions.map(v => ({ label: `v${v}`, value: String(v) })),
                    );
                    const select = new StringSelectMenuBuilder()
                        .setCustomId('desc_select_version')
                        .setPlaceholder('Select version')
                        .addOptions(
                            versionOptions.length ? versionOptions : [{ label: 'No versions', value: 'novers' }],
                        );
                    await interaction.followUp({
                        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else if (branch === 'load_txt') {
                    await interaction.followUp({
                        content: 'Please upload a .txt file now with the full description text.',
                        flags: MessageFlags.Ephemeral,
                    });
                } else if (branch === 'toggle_public') {
                    // Toggle and then go back to menu by reusing previous step
                    const newPublic = !(ctx.state.isPublic ?? false);
                    await togglePublic(ctx.state.targetType!, ctx.state.targetUid!, ctx.state.orgUid!, newPublic);
                    ctx.state.isPublic = newPublic;
                    await interaction.followUp({
                        content: `Visibility set to ${newPublic ? 'public' : 'private'}.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    // After toggling, re-open menu: clear branch and fast-forward to menu return
                    (ctx.state as any).__next = undefined;
                    await ctx.advance(); // skip edit input
                    await ctx.advance(); // skip apply, go to menu return
                    return;
                }
            })
            .onInteraction(async (ctx: any, i: any) => {
                const branch = (ctx.state as any).__next;
                if (branch === 'version') {
                    if (!i.isStringSelectMenu()) return false;
                    const v = Number(i.values[0]);
                    const d = await getVersion(ctx.state.targetType!, ctx.state.targetUid!, ctx.state.orgUid!, v);
                    ctx.state.latestText = d?.text ?? ctx.state.latestText;
                    ctx.state.latestVersion = d?.version ?? ctx.state.latestVersion;
                    // After selecting version, return to menu
                    (ctx.state as any).__next = undefined;
                    (ctx.state as any).__goMenu = true;
                    await i.deferUpdate();
                    return true;
                }
                return false;
            })
            .next()
            // Step 6: ask for edit text (message)
            .step('desc_edit_input')
            .prompt(async ctx => {
                const next = (ctx.state as any).__next;
                if ((ctx.state as any).__goMenu || (next && next !== 'load_txt' && next !== 'edit')) {
                    // Skip to menu return
                    (ctx.state as any).__goMenu = undefined;
                    (ctx.state as any).__next = undefined;
                    await ctx.advance();
                    await ctx.advance();
                    return;
                }
                if (next === 'load_txt') {
                    await interaction.followUp({
                        content: 'Awaiting .txt file upload...',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                await interaction.followUp({
                    content: 'Send the text to apply for the selected edit mode.',
                    flags: MessageFlags.Ephemeral,
                });
            })
            .onMessage(async (ctx: any, msg: any) => {
                // Accept file if previous branch was load_txt
                if ((ctx.state as any).__next === 'load_txt') {
                    const att = msg.attachments?.first?.();
                    if (!att || !String(att.name).toLowerCase().endsWith('.txt')) {
                        await msg.reply('Please upload a .txt file.');
                        return false;
                    }
                    const response = await fetch(att.url);
                    const text = await response.text();
                    ctx.state.editText = text;
                    (ctx.state as any).__next = undefined;
                    return true;
                }
                // Otherwise use message content
                ctx.state.editText = msg.content ?? '';
                return true;
            })
            .next()
            // Step 7: confirm apply and create new version
            .step('desc_confirm')
            .prompt(async ctx => {
                const { editMode = 'replace', editText = '' } = ctx.state as State;
                const preview = applyEdit(ctx.state.latestText || '', editMode, editText);
                await interaction.followUp({
                    embeds: buildDescriptionEmbeds(
                        preview,
                        (ctx.state.latestVersion ?? 0) + 1,
                        ctx.state.isPublic ?? false,
                    ),
                    content: 'Confirm to save this as a new version or cancel to abort.',
                    flags: MessageFlags.Ephemeral,
                    components: [
                        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('desc_confirm')
                                .setPlaceholder('Confirm changes?')
                                .addOptions([
                                    { label: 'Confirm', value: 'confirm' },
                                    { label: 'Cancel', value: 'cancel' },
                                ]),
                        ),
                    ],
                });
            })
            .onInteraction(async (ctx: any, i: any) => {
                if (!i.isStringSelectMenu()) return false;
                const v = i.values[0];
                await i.deferUpdate();
                if (v === 'cancel') {
                    await (ctx as any).cancel();
                    return false;
                }
                // Confirm
                const newText = applyEdit(
                    ctx.state.latestText || '',
                    ctx.state.editMode || 'replace',
                    ctx.state.editText || '',
                );
                const newVer = await createDescriptionVersion(
                    ctx.state.targetType!,
                    ctx.state.targetUid!,
                    ctx.state.orgUid!,
                    newText,
                    interaction.user.id,
                );
                ctx.state.latestText = newVer.text;
                ctx.state.latestVersion = newVer.version;
                await interaction.followUp({
                    content: `Saved version v${newVer.version}.`,
                    flags: MessageFlags.Ephemeral,
                });
                return true;
            })
            .next()
            // Step 8: back to menu to continue or exit (customId must match menu component)
            .step('desc_menu')
            .prompt(async ctx => {
                // Re-open the menu after saving or viewing
                (ctx.state as any).__next = undefined;
                const embeds = buildDescriptionEmbeds(
                    ctx.state.latestText || '',
                    ctx.state.latestVersion || 0,
                    ctx.state.isPublic ?? false,
                );
                const menu = new StringSelectMenuBuilder()
                    .setCustomId('desc_menu')
                    .setPlaceholder('Choose an action')
                    .addOptions([
                        { label: 'Edit', value: 'edit' },
                        { label: 'Select version', value: 'version' },
                        { label: 'Load as txt file', value: 'load_txt' },
                        {
                            label: ctx.state.isPublic ? 'Make private' : 'Generalize (make public)',
                            value: 'toggle_public',
                        },
                        { label: 'Exit', value: 'exit' },
                    ]);
                await interaction.followUp({
                    embeds,
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
                    flags: MessageFlags.Ephemeral,
                });
            })
            .onInteraction(async (ctx: any, i: any) => {
                if (!i.isStringSelectMenu()) return false;
                const choice = i.values[0];
                await i.deferUpdate();
                if (choice === 'exit') {
                    await (ctx as any).cancel();
                    return false;
                }
                // Restart at menu step by advancing into edit/branch path again
                (ctx.state as any).__next = choice === 'edit' ? 'edit' : choice;
                return true;
            })
            .next()
            .start();
    });
}

function chunkString(input: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < input.length; i += size) chunks.push(input.slice(i, i + size));
    return chunks;
}

function buildDescriptionEmbeds(text: string, version: number, isPublic: boolean) {
    const parts = chunkString(text || '(empty)', 4000);
    return parts.map((p, idx) =>
        new EmbedBuilder()
            .setTitle(
                `Description v${version}${isPublic ? ' (public)' : ''}${parts.length > 1 ? ` [${idx + 1}/${parts.length}]` : ''}`,
            )
            .setDescription(p)
            .setColor('Blue'),
    );
}

function applyEdit(current: string, mode: 'append' | 'remove' | 'replace', input: string): string {
    switch (mode) {
        case 'append':
            return current + (input ? `\n${input}` : '');
        case 'remove':
            if (!input) return current;
            // naive remove occurrences
            return current.split(input).join('');
        case 'replace':
        default:
            return input;
    }
}

async function listVersions(
    refType: 'organization' | 'game' | 'user',
    refUid: string,
    orgUid: string,
): Promise<number[]> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const q = `MATCH (d:Description { refType: $refType, refUid: $refUid, orgUid: $orgUid }) RETURN d.version as v ORDER BY v DESC`;
        const res = await session.run(q, { refType, refUid, orgUid });
        return res.records.map(r => Number(r.get('v')));
    } finally {
        await session.close();
    }
}

async function getVersion(refType: 'organization' | 'game' | 'user', refUid: string, orgUid: string, version: number) {
    const session = await neo4jClient.GetSession('READ');
    try {
        const q = `MATCH (d:Description { refType: $refType, refUid: $refUid, orgUid: $orgUid, version: $version }) RETURN d`;
        const res = await session.run(q, { refType, refUid, orgUid, version });
        if (!res.records.length) return null;
        const props = res.records[0].get('d').properties;
        return { text: String(props.text), version: Number(props.version), isPublic: Boolean(props.isPublic) };
    } finally {
        await session.close();
    }
}

async function togglePublic(
    refType: 'organization' | 'game' | 'user',
    refUid: string,
    orgUid: string,
    isPublic: boolean,
) {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        const q = `MATCH (d:Description { refType: $refType, refUid: $refUid, orgUid: $orgUid })
                   WITH d ORDER BY d.version DESC LIMIT 1
                   SET d.isPublic = $isPublic RETURN d`;
        await session.run(q, { refType, refUid, orgUid, isPublic });
    } finally {
        await session.close();
    }
}
