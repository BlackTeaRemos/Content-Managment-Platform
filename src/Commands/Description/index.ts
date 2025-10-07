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
import { log } from '../../Common/Log.js';

interface State {
    targetType?: 'organization' | 'game' | 'user';
    targetUid?: string;
    orgUid?: string;
    latestText?: string;
    latestVersion?: number;
    isPublic?: boolean;
    editMode?: 'append' | 'remove' | 'replace';
    editText?: string;
    editInputs?: string[];
    awaitingFile?: boolean;
    nextAction?: 'edit' | 'version' | 'load_txt' | 'toggle_public';
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

type DescriptionViewOptions = {
    content?: string;
    embeds?: EmbedBuilder[];
};

type ControlViewOptions = {
    content?: string;
    components?: ActionRowBuilder<StringSelectMenuBuilder>[];
};

const DESCRIPTION_LOG_SOURCE = 'Commands/Description';

/**
 * Convert unknown error values to a concise message for logs and user feedback.
 * @param error unknown Raised error or rejection reason. Example new Error('Too large').
 * @returns string Sanitized short message describing the error. Example 'Too large'.
 */
function errorToMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
    return raw.length > 300 ? `${raw.slice(0, 297)}...` : raw;
}

/**
 * Append an informational note when a preview has been truncated.
 * @param baseText string Original message text prior to appending the note.
 * @param truncated boolean Indicates whether truncation happened. Example true when description exceeds limits.
 * @returns string Message with optional truncation note appended.
 */
function withTruncationNote(baseText: string, truncated: boolean): string {
    if (!truncated) return baseText;
    const suffix = baseText.includes('\n')
        ? '\nPreview trimmed to fit Discord limits.'
        : ' Preview trimmed to fit Discord limits.';
    return `${baseText}${suffix}`;
}

/**
 * Resolve the original chat interaction used for the description flow.
 * @param ctx DescriptionStepContext Flow step context containing cached interaction details. Example: the step context from the root selection step.
 * @returns ChatInputCommandInteraction | undefined Interaction that can be reused for replies, or undefined when unavailable. Example usage: const interaction = resolveBaseInteraction(ctx).
 */
function resolveBaseInteraction(ctx: DescriptionStepContext): ChatInputCommandInteraction | undefined {
    const stored = ctx.recall<ChatInputCommandInteraction>('root', 'interaction');
    if (stored) return stored;
    if (ctx.interaction && 'isChatInputCommand' in ctx.interaction && ctx.interaction.isChatInputCommand()) {
        return ctx.interaction;
    }
    return undefined;
}

/**
 * Render or update the persistent description preview message.
 * @param ctx DescriptionStepContext Flow step context referencing the creator interaction.
 * @param options DescriptionViewOptions Text or embeds that represent the current description state.
 * @returns Promise<void> Completes when the message has been sent or edited. Example usage: await renderDescription(ctx, { embeds }).
 */
async function renderDescription(ctx: DescriptionStepContext, options: DescriptionViewOptions) {
    const base = resolveBaseInteraction(ctx);
    if (!base) return;
    const payload = {
        content: options.content ?? '',
        embeds: options.embeds ?? [],
    };
    try {
        if (!base.replied && !base.deferred) {
            await base.reply({ ...payload, flags: MessageFlags.Ephemeral });
        } else {
            await base.editReply(payload);
        }
    } catch (error) {
        const message = errorToMessage(error);
        log.error(`renderDescription failed: ${message}`, DESCRIPTION_LOG_SOURCE, 'renderDescription');
        const fallbackMessage = options.content
            ? `${options.content}
Preview unavailable. Reason: ${message}`
            : `Preview unavailable. Reason: ${message}`;
        const fallback = {
            content: fallbackMessage,
            embeds: [] as EmbedBuilder[],
        };
        try {
            if (!base.replied && !base.deferred) {
                await base.reply({ ...fallback, flags: MessageFlags.Ephemeral });
            } else {
                await base.editReply(fallback);
            }
        } catch (secondaryError) {
            log.error(
                `renderDescription fallback failed: ${errorToMessage(secondaryError)}`,
                DESCRIPTION_LOG_SOURCE,
                'renderDescription',
            );
        }
    }
}

/**
 * Render or update the separate controls interface that hosts menus and buttons.
 * @param ctx DescriptionStepContext Flow step context used to retrieve or store control message metadata.
 * @param options ControlViewOptions Content and components that represent interactive controls for the flow.
 * @returns Promise<void> Completes when the controls message is sent or updated. Example usage: await renderControls(ctx, { components }).
 */
async function renderControls(ctx: DescriptionStepContext, options: ControlViewOptions) {
    const base = resolveBaseInteraction(ctx);
    if (!base) return;
    const rootSnapshot = ctx.getStep('root');
    const storedId = (rootSnapshot?.data?.controlsMessageId as string | undefined) ?? undefined;
    const payload = {
        content: options.content ?? '',
        components: options.components ?? [],
    };
    if (storedId) {
        try {
            await base.webhook.editMessage(storedId, payload);
            return;
        } catch (error) {
            log.warning(
                `renderControls edit failed for message ${storedId}: ${errorToMessage(error)}`,
                DESCRIPTION_LOG_SOURCE,
                'renderControls',
            );
            // If editing fails (message expired), fall through to create a new controls message.
        }
    }
    try {
        const message = await base.followUp({ ...payload, flags: MessageFlags.Ephemeral });
        if (rootSnapshot) {
            (rootSnapshot.data as Record<string, unknown>).controlsMessageId = message.id;
        }
    } catch (error) {
        const message = errorToMessage(error);
        log.error(`renderControls failed: ${message}`, DESCRIPTION_LOG_SOURCE, 'renderControls');
        try {
            const fallback = await base.followUp({
                content: `Controls unavailable: ${message}`,
                flags: MessageFlags.Ephemeral,
            });
            if (rootSnapshot) {
                (rootSnapshot.data as Record<string, unknown>).controlsMessageId = fallback.id;
            }
        } catch (secondaryError) {
            log.error(
                `renderControls fallback failed: ${errorToMessage(secondaryError)}`,
                DESCRIPTION_LOG_SOURCE,
                'renderControls',
            );
        }
    }
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
            .step('desc_select_type', 'root')
            .prompt(async (ctx: DescriptionStepContext) => {
                const base = resolveBaseInteraction(ctx);
                if (base && !ctx.recall('root', 'interaction')) {
                    ctx.remember('interaction', base);
                }
                const select = new StringSelectMenuBuilder()
                    .setCustomId('desc_select_type')
                    .setPlaceholder('Select object type to describe')
                    .addOptions([
                        { label: 'Organization', value: 'organization' },
                        { label: 'Game', value: 'game' },
                        { label: 'User', value: 'user' },
                    ]);
                await renderDescription(ctx, {
                    content: 'Description preview will appear here after an object is selected.',
                });
                await renderControls(ctx, {
                    content: 'Select object type to begin.',
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
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
                if (!type) {
                    await renderDescription(ctx, {
                        content: 'Object type was not selected. Cancelling description flow.',
                    });
                    await renderControls(ctx, { content: 'Flow cancelled.', components: [] });
                    await ctx.cancel();
                    return;
                }
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
                    await renderDescription(ctx, {
                        content: `Type selected: ${map[type].label}. Description preview will update after choosing a specific ${map[type].label}.`,
                    });
                    await renderControls(ctx, {
                        content: `Select ${map[type].label}`,
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
                        await renderDescription(ctx, {
                            content: 'You do not belong to any organization. Description creation cancelled.',
                        });
                        await renderControls(ctx, { content: 'Flow cancelled.', components: [] });
                        await ctx.cancel();
                        return;
                    }
                    if (orgs.length === 1) {
                        ctx.state.orgUid = orgs[0].uid;
                        await renderDescription(ctx, {
                            content: `Using organization **${orgs[0].name}** for this description. Description preview will update once the latest version is loaded.`,
                        });
                        await renderControls(ctx, {
                            content: 'Organization auto-selected. Preparing description...',
                            components: [],
                        });
                        await ctx.advance();
                        return;
                    }
                    const select = new StringSelectMenuBuilder()
                        .setCustomId('desc_select_org')
                        .setPlaceholder('Select organization for this description')
                        .addOptions(uniqueSelectOptions(orgs.map(o => ({ label: o.name.slice(0, 50), value: o.uid }))));
                    await renderDescription(ctx, {
                        content:
                            'Select the organization that owns this description. Preview will appear after loading the latest version.',
                    });
                    await renderControls(ctx, {
                        content: 'Select organization for this description',
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

                const descriptionPreview = buildDescriptionEmbeds(
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
                await renderDescription(ctx, {
                    content: withTruncationNote('Description preview', descriptionPreview.truncated),
                    embeds: descriptionPreview.embeds,
                });
                await renderControls(ctx, {
                    content: 'Choose what to do next.',
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
                });
            })
            .onInteraction(async (ctx: any, i: any) => {
                if (!i.isStringSelectMenu()) return false;
                const choice = i.values[0];
                await i.deferUpdate();
                switch (choice) {
                    case 'edit':
                        ctx.state.nextAction = 'edit';
                        return true; // advance to edit mode step
                    case 'version':
                        ctx.state.nextAction = 'version';
                        return true; // advance to version select
                    case 'load_txt':
                        ctx.state.nextAction = 'load_txt';
                        return true; // advance to upload step
                    case 'toggle_public':
                        ctx.state.nextAction = 'toggle_public';
                        return true;
                    case 'exit':
                        await (ctx as any).cancel();
                        return false;
                }
                return false;
            })
            .next()
            // Step 5b: handle redirects from menu: version selection, load txt, toggle public
            // For version selection, customId must match the select component's customId
            .step('desc_select_version')
            .prompt(async ctx => {
                const action = ctx.state.nextAction;
                switch (action) {
                    case 'version': {
                        const versions = await listVersions(
                            ctx.state.targetType!,
                            ctx.state.targetUid!,
                            ctx.state.orgUid!,
                        );
                        const versionOptions = uniqueSelectOptions(
                            versions.map(v => ({ label: `v${v}`, value: String(v) })),
                        );
                        const select = new StringSelectMenuBuilder()
                            .setCustomId('desc_select_version')
                            .setPlaceholder('Select version')
                            .addOptions(
                                versionOptions.length ? versionOptions : [{ label: 'No versions', value: 'novers' }],
                            );
                        await renderControls(ctx, {
                            content: 'Select which version to view.',
                            components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
                        });
                        return;
                    }
                    case 'load_txt': {
                        await renderControls(ctx, {
                            content: 'Upload a .txt file with the description contents to continue.',
                            components: [],
                        });
                        ctx.state.awaitingFile = true;
                        ctx.state.editInputs = [];
                        ctx.state.editText = '';
                        ctx.state.nextAction = 'edit';
                        await ctx.advance();
                        return;
                    }
                    case 'toggle_public': {
                        const newPublic = !(ctx.state.isPublic ?? false);
                        await togglePublic(ctx.state.targetType!, ctx.state.targetUid!, ctx.state.orgUid!, newPublic);
                        ctx.state.isPublic = newPublic;
                        ctx.state.nextAction = undefined;
                        const visibilityPreview = buildDescriptionEmbeds(
                            ctx.state.latestText || '',
                            ctx.state.latestVersion ?? 0,
                            ctx.state.isPublic ?? false,
                        );
                        await renderDescription(ctx, {
                            content: withTruncationNote(
                                `Visibility set to ${newPublic ? 'public' : 'private'}.`,
                                visibilityPreview.truncated,
                            ),
                            embeds: visibilityPreview.embeds,
                        });
                        await renderControls(ctx, {
                            content: 'Visibility updated. Flow will now end.',
                            components: [],
                        });
                        await ctx.cancel();
                        return;
                    }
                    default: {
                        ctx.state.nextAction = 'edit';
                        await ctx.advance();
                        return;
                    }
                }
            })
            .onInteraction(async (ctx: any, i: any) => {
                const action = ctx.state.nextAction;
                if (action === 'version') {
                    if (!i.isStringSelectMenu()) return false;
                    const v = Number(i.values[0]);
                    await i.deferUpdate();
                    if (Number.isNaN(v)) {
                        await renderControls(ctx, {
                            content: 'No stored versions are available for this description.',
                            components: [],
                        });
                        await ctx.cancel();
                        return false;
                    }
                    const d = await getVersion(ctx.state.targetType!, ctx.state.targetUid!, ctx.state.orgUid!, v);
                    ctx.state.latestText = d?.text ?? ctx.state.latestText;
                    ctx.state.latestVersion = d?.version ?? ctx.state.latestVersion;
                    ctx.state.nextAction = undefined;
                    const versionPreview = buildDescriptionEmbeds(
                        ctx.state.latestText || '',
                        ctx.state.latestVersion ?? v,
                        ctx.state.isPublic ?? false,
                    );
                    await renderDescription(ctx, {
                        content: withTruncationNote(
                            `Loaded version v${ctx.state.latestVersion ?? v}.`,
                            versionPreview.truncated,
                        ),
                        embeds: versionPreview.embeds,
                    });
                    await renderControls(ctx, { content: 'Version loaded. Flow will now end.', components: [] });
                    await ctx.cancel();
                    return false;
                }
                return false;
            })
            .next()
            // Step 6: continuous editing session listening for messages
            .step('desc_edit_session', 'edit_session')
            .prompt(async (ctx: DescriptionStepContext) => {
                ctx.state.editMode = ctx.state.editMode ?? 'replace';
                ctx.state.nextAction = 'edit';
                if (!ctx.state.editInputs || !ctx.state.editInputs.length) {
                    if (ctx.state.editText) {
                        ctx.state.editInputs = [ctx.state.editText];
                    } else {
                        ctx.state.editInputs = [];
                    }
                }
                ctx.state.editText = (ctx.state.editInputs ?? []).join('\n');
                const preview = applyEdit(ctx.state.latestText || '', ctx.state.editMode, ctx.state.editText || '');
                const previewEmbeds = buildDescriptionEmbeds(
                    preview,
                    (ctx.state.latestVersion ?? 0) + 1,
                    ctx.state.isPublic ?? false,
                );
                await renderDescription(ctx, {
                    content: withTruncationNote(
                        `Editing in ${ctx.state.editMode} mode. Preview includes pending changes before saving.`,
                        previewEmbeds.truncated,
                    ),
                    embeds: previewEmbeds.embeds,
                });
                await renderControls(ctx, {
                    content: buildEditControlsContent(ctx.state),
                    components: [
                        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildEditControlsMenu(ctx.state)),
                    ],
                });
            })
            .onInteraction(async (ctx: DescriptionStepContext, i: Interaction) => {
                if (!i.isStringSelectMenu()) return false;
                await i.deferUpdate();
                const choice = (i as StringSelectMenuInteraction).values[0];
                if (choice === 'confirm') {
                    const mode = ctx.state.editMode ?? 'replace';
                    const pending = ctx.state.editText ?? '';
                    if (!pending.trim()) {
                        await renderControls(ctx, {
                            content: 'No inputs captured yet. Add content before confirming.',
                            components: [
                                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                                    buildEditControlsMenu(ctx.state),
                                ),
                            ],
                        });
                        return false;
                    }
                    const newText = applyEdit(ctx.state.latestText || '', mode, pending);
                    const newVer = await createDescriptionVersion(
                        ctx.state.targetType!,
                        ctx.state.targetUid!,
                        ctx.state.orgUid!,
                        newText,
                        interaction.user.id,
                    );
                    ctx.state.latestText = newVer.text;
                    ctx.state.latestVersion = newVer.version;
                    ctx.state.editInputs = [];
                    ctx.state.editText = '';
                    ctx.state.awaitingFile = false;
                    ctx.state.nextAction = undefined;
                    const savedPreview = buildDescriptionEmbeds(
                        ctx.state.latestText || '',
                        ctx.state.latestVersion ?? newVer.version,
                        ctx.state.isPublic ?? false,
                    );
                    await renderDescription(ctx, {
                        content: withTruncationNote(`Saved version v${newVer.version}.`, savedPreview.truncated),
                        embeds: savedPreview.embeds,
                    });
                    await renderControls(ctx, { content: `Saved version v${newVer.version}.`, components: [] });
                    await ctx.cancel();
                    return false;
                }
                if (choice === 'cancel') {
                    ctx.state.nextAction = undefined;
                    ctx.state.editInputs = [];
                    ctx.state.editText = '';
                    ctx.state.awaitingFile = false;
                    const cancelledPreview = buildDescriptionEmbeds(
                        ctx.state.latestText || '',
                        ctx.state.latestVersion ?? 0,
                        ctx.state.isPublic ?? false,
                    );
                    await renderDescription(ctx, {
                        content: withTruncationNote(
                            'Description update cancelled. Current description remains unchanged.',
                            cancelledPreview.truncated,
                        ),
                        embeds: cancelledPreview.embeds,
                    });
                    await renderControls(ctx, { content: 'Description update cancelled.', components: [] });
                    await ctx.cancel();
                    return false;
                }
                if (choice === 'reset') {
                    ctx.state.editInputs = [];
                    ctx.state.editText = '';
                    ctx.state.awaitingFile = false;
                } else if (choice === 'mode_replace') {
                    ctx.state.editMode = 'replace';
                    ctx.state.editInputs = [];
                    ctx.state.editText = '';
                } else if (choice === 'mode_append') {
                    ctx.state.editMode = 'append';
                    ctx.state.editInputs = [];
                    ctx.state.editText = '';
                } else if (choice === 'mode_remove') {
                    ctx.state.editMode = 'remove';
                    ctx.state.editInputs = [];
                    ctx.state.editText = '';
                }
                const preview = applyEdit(
                    ctx.state.latestText || '',
                    ctx.state.editMode ?? 'replace',
                    ctx.state.editText || '',
                );
                const updatedPreview = buildDescriptionEmbeds(
                    preview,
                    (ctx.state.latestVersion ?? 0) + 1,
                    ctx.state.isPublic ?? false,
                );
                await renderDescription(ctx, {
                    content: withTruncationNote(
                        `Editing in ${ctx.state.editMode ?? 'replace'} mode. Preview includes pending changes before saving.`,
                        updatedPreview.truncated,
                    ),
                    embeds: updatedPreview.embeds,
                });
                await renderControls(ctx, {
                    content: buildEditControlsContent(ctx.state),
                    components: [
                        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildEditControlsMenu(ctx.state)),
                    ],
                });
                return false;
            })
            .onMessage(async (ctx: DescriptionStepContext, msg: Message) => {
                let inputText = '';
                const attachment = msg.attachments?.first?.();
                const attachmentIsTxt = Boolean(attachment && String(attachment.name).toLowerCase().endsWith('.txt'));
                if (ctx.state.awaitingFile ?? false) {
                    if (!attachmentIsTxt) {
                        await msg.reply('Please upload a .txt file to continue.');
                        return false;
                    }
                    const response = await fetch(attachment!.url);
                    inputText = await response.text();
                } else if (attachmentIsTxt) {
                    const response = await fetch(attachment!.url);
                    inputText = await response.text();
                } else {
                    inputText = msg.content ?? '';
                }
                if (!inputText.trim()) {
                    await msg.reply('Please provide text content to apply.');
                    return false;
                }
                ctx.state.awaitingFile = false;
                const mode = ctx.state.editMode ?? 'replace';
                ctx.state.nextAction = 'edit';
                if (!ctx.state.editInputs) ctx.state.editInputs = [];
                if (mode === 'append') {
                    ctx.state.editInputs.push(inputText);
                } else {
                    ctx.state.editInputs = [inputText];
                }
                ctx.state.editText = ctx.state.editInputs.join('\n');
                const preview = applyEdit(ctx.state.latestText || '', mode, ctx.state.editText || '');
                const messagePreview = buildDescriptionEmbeds(
                    preview,
                    (ctx.state.latestVersion ?? 0) + 1,
                    ctx.state.isPublic ?? false,
                );
                await renderDescription(ctx, {
                    content: withTruncationNote(
                        `Editing in ${mode} mode. Preview includes pending changes before saving.`,
                        messagePreview.truncated,
                    ),
                    embeds: messagePreview.embeds,
                });
                await renderControls(ctx, {
                    content: buildEditControlsContent(ctx.state),
                    components: [
                        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildEditControlsMenu(ctx.state)),
                    ],
                });
                return false;
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

interface DescriptionEmbedPayload {
    embeds: EmbedBuilder[];
    truncated: boolean;
}

function buildDescriptionEmbeds(text: string, version: number, isPublic: boolean): DescriptionEmbedPayload {
    const MAX_TOTAL_CHARACTERS = 5800; // stay under Discord's 6000 total description cap
    const MAX_PER_EMBED = 1800; // leave room for appended truncation note
    const sanitized = text && text.length ? text : '(empty)';
    let working = sanitized;
    let truncated = false;
    if (working.length > MAX_TOTAL_CHARACTERS) {
        working = working.slice(0, MAX_TOTAL_CHARACTERS);
        truncated = true;
    }
    const parts = chunkString(working, MAX_PER_EMBED);
    const embeds = parts.map((p, idx) => {
        const note = truncated && idx === parts.length - 1 ? '\n\nPreview trimmed due to Discord limits.' : '';
        return new EmbedBuilder()
            .setTitle(
                `Description v${version}${isPublic ? ' (public)' : ''}${parts.length > 1 ? ` [${idx + 1}/${parts.length}]` : ''}`,
            )
            .setDescription(`${p}${note}`)
            .setColor('Blue');
    });
    return { embeds, truncated };
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

/**
 * Compose user-facing text for the editing controls view.
 * @param state State Current flow state providing editing context. Example: state.editMode === 'append'.
 * @returns string Instructions describing the active mode and pending inputs. Example: 'Editing mode: append...'.
 */
function buildEditControlsContent(state: State): string {
    const mode = state.editMode ?? 'replace';
    const awaiting = state.awaitingFile
        ? '\nUpload a .txt file to import content.'
        : '\nSend a message to add content.';
    const inputCount = state.editInputs?.length ?? 0;
    const inputSummary = inputCount
        ? `\nCaptured ${inputCount} input${inputCount === 1 ? '' : 's'} awaiting confirmation.`
        : '\nNo inputs captured yet.';
    return `Editing mode: ${mode}.${awaiting}${inputSummary}\nUse the selector to change mode, reset, confirm, or cancel.`;
}

/**
 * Build the select menu representing editing controls.
 * @param state State Current flow state providing editing context. Example: state.editMode === 'replace'.
 * @returns StringSelectMenuBuilder Selector configured with mode, reset, confirm, and cancel actions. Example: menu with confirm value.
 */
function buildEditControlsMenu(state: State): StringSelectMenuBuilder {
    const mode = state.editMode ?? 'replace';
    const menu = new StringSelectMenuBuilder()
        .setCustomId('desc_edit_session')
        .setPlaceholder('Editing controls')
        .addOptions([
            {
                label: mode === 'replace' ? 'Mode: Replace (current)' : 'Switch to replace',
                value: 'mode_replace',
            },
            {
                label: mode === 'append' ? 'Mode: Append (current)' : 'Switch to append',
                value: 'mode_append',
            },
            {
                label: mode === 'remove' ? 'Mode: Remove (current)' : 'Switch to remove',
                value: 'mode_remove',
            },
            { label: 'Confirm changes', value: 'confirm' },
            { label: 'Reset collected inputs', value: 'reset' },
            { label: 'Cancel editing', value: 'cancel' },
        ]);
    return menu;
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
