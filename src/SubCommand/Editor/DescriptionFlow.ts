import { StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, Interaction, Message, StringSelectMenuInteraction } from 'discord.js';
import type { FlowManager } from '../../Common/Flow/Manager.js';
import type { ExecutionContext } from '../../Domain/index.js';
import type { StepContext } from '../../Common/Flow/Types.js';

import { renderDescription, renderControls, resolveBaseInteraction } from './Description/rendering.js';
import { buildDescriptionEmbeds } from './Description/buildDescriptionEmbeds.js';
import { withTruncationNote } from './Description/withTruncationNote.js';
import { applyEdit } from '../../Flow/Command/Description/applyEdit.js';
import { buildEditControlsContent } from './Description/buildEditControlsContent.js';
import { buildEditControlsMenu } from './Description/buildEditControlsMenu.js';
import { uniqueSelectOptions } from '../../Flow/Command/Description/helpers.js';
import {
    listVersions,
    getVersion,
    togglePublic,
    listObjectsForType,
    listUserOrgs,
} from '../../Flow/Command/Description/db.js';
import { getLatestDescription } from '../../Flow/Object/Description/Latest.js';
import { createDescriptionVersion } from '../../Flow/Object/Description/Update.js';

/**
 * Internal state carried across the description creation flow.
 */
export interface State {
    targetType?: 'game' | 'organization' | 'user';
    targetUid?: string;
    orgUid?: string;
    latestText?: string;
    latestVersion?: number;
    isPublic?: boolean;
    editMode?: 'replace' | 'append' | 'remove';
    editText?: string;
    editInputs?: string[];
    awaitingFile?: boolean;
    nextAction?: 'edit' | 'version' | 'load_txt' | 'toggle_public';
}

type DescriptionStepContext = StepContext<State>;

/**
 * Start the interactive description creation flow.
 */
export async function startDescriptionCreateFlow(
    flowManager: FlowManager,
    interaction: ChatInputCommandInteraction,
    executionContext?: ExecutionContext,
) {
    await flowManager
        .builder(interaction.user.id, interaction, {} as State, executionContext)
        .step('desc_select_type', 'root')
        .prompt(async (ctx: DescriptionStepContext) => {
            const base = resolveBaseInteraction(ctx);
            if (base && !ctx.recall('root', 'interaction')) ctx.remember('interaction', base);
            const select = new StringSelectMenuBuilder()
                .setCustomId('desc_select_type')
                .setPlaceholder('Select object type to describe')
                .addOptions([
                    { label: 'Organization', value: 'organization' },
                    { label: 'Game', value: 'game' },
                    { label: 'User', value: 'user' },
                ] as any);
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
        .step('desc_select_object')
        .prompt(async (ctx: DescriptionStepContext) => {
            const type = ctx.state.targetType as State['targetType'];
            if (!type) {
                await renderDescription(ctx, { content: 'Object type was not selected. Cancelling description flow.' });
                await renderControls(ctx, { content: 'Flow cancelled.', components: [] });
                await ctx.cancel();
                return;
            }
            const records = await listObjectsForType(type);
            const options = uniqueSelectOptions(
                records.map((r: any) => ({ label: r.label.slice(0, 50), value: r.uid })),
            );
            if (options.length === 0) {
                await renderDescription(ctx, { content: `No ${type} objects found.` });
                await renderControls(ctx, { content: 'Flow cancelled.', components: [] });
                await ctx.cancel();
                return;
            }
            const select = new StringSelectMenuBuilder()
                .setCustomId('desc_select_object')
                .setPlaceholder(`Select ${type}`)
                .addOptions(options as any);
            await renderDescription(ctx, {
                content: `Type selected: ${type}. Description preview will update after choosing a specific ${type}.`,
            });
            await renderControls(ctx, {
                content: `Select ${type}`,
                components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
            });
        })
        .onInteraction(async (ctx: DescriptionStepContext, i: Interaction) => {
            if (!i.isStringSelectMenu()) return false;
            ctx.state.targetUid = i.values[0];
            await i.deferUpdate();
            return true;
        })
        .next()
        .step('desc_select_org')
        .prompt(async (ctx: DescriptionStepContext) => {
            const orgs = await listUserOrgs(interaction.user.id);
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
                .addOptions(uniqueSelectOptions(orgs.map(o => ({ label: o.name.slice(0, 50), value: o.uid }))) as any);
            await renderDescription(ctx, {
                content:
                    'Select the organization that owns this description. Preview will appear after loading the latest version.',
            });
            await renderControls(ctx, {
                content: 'Select organization for this description',
                components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
            });
        })
        .onInteraction(async (ctx: DescriptionStepContext, i: Interaction) => {
            if (!i.isStringSelectMenu()) return false;
            ctx.state.orgUid = i.values[0];
            await i.deferUpdate();
            return true;
        })
        .next()
        .step('desc_menu')
        .prompt(async (ctx: DescriptionStepContext) => {
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
                    { label: ctx.state.isPublic ? 'Make private' : 'Generalize (make public)', value: 'toggle_public' },
                    { label: 'Exit', value: 'exit' },
                ] as any);
            await renderDescription(ctx, {
                content: withTruncationNote('Description preview', descriptionPreview.truncated),
                embeds: descriptionPreview.embeds,
            });
            await renderControls(ctx, {
                content: 'Choose what to do next.',
                components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
            });
        })
        .onInteraction(async (ctx: DescriptionStepContext, i: Interaction) => {
            if (!i.isStringSelectMenu()) return false;
            const choice = i.values[0];
            await i.deferUpdate();
            switch (choice) {
                case 'edit':
                    ctx.state.nextAction = 'edit';
                    return true;
                case 'version':
                    ctx.state.nextAction = 'version';
                    return true;
                case 'load_txt':
                    ctx.state.nextAction = 'load_txt';
                    return true;
                case 'toggle_public':
                    ctx.state.nextAction = 'toggle_public';
                    return true;
                case 'exit':
                    await ctx.cancel();
                    return false;
            }
            return false;
        })
        .next()
        .step('desc_select_version')
        .prompt(async (ctx: DescriptionStepContext) => {
            const action = ctx.state.nextAction;
            switch (action) {
                case 'version': {
                    const versions = await listVersions(ctx.state.targetType!, ctx.state.targetUid!, ctx.state.orgUid!);
                    const versionOptions = uniqueSelectOptions(
                        versions.map(v => ({ label: `v${v}`, value: String(v) })),
                    );
                    const select = new StringSelectMenuBuilder()
                        .setCustomId('desc_select_version')
                        .setPlaceholder('Select version')
                        .addOptions(
                            versionOptions.length
                                ? versionOptions
                                : ([{ label: 'No versions', value: 'novers' }] as any),
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
                    await renderControls(ctx, { content: 'Visibility updated. Flow will now end.', components: [] });
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
        .onInteraction(async (ctx: DescriptionStepContext, i: Interaction) => {
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
        .step('desc_edit_session', 'edit_session')
        .prompt(async (ctx: DescriptionStepContext) => {
            ctx.state.editMode = ctx.state.editMode ?? 'replace';
            ctx.state.nextAction = 'edit';
            if (!ctx.state.editInputs || !ctx.state.editInputs.length) {
                if (ctx.state.editText) ctx.state.editInputs = [ctx.state.editText];
                else ctx.state.editInputs = [];
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
            if (mode === 'append') ctx.state.editInputs.push(inputText);
            else ctx.state.editInputs = [inputText];
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
}
