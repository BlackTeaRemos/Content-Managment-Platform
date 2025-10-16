import { EmbedBuilder } from 'discord.js';
import { chunkString } from './chunkString.js';

/**
 * Build Discord embeds for a description preview handling Discord character limits.
 * @param text string Description text
 * @param version number Current version
 * @param isPublic boolean Visibility flag
 * @returns { embeds: EmbedBuilder[]; truncated: boolean }
 */
export function buildDescriptionEmbeds(
    text: string,
    version: number,
    isPublic: boolean,
): { embeds: EmbedBuilder[]; truncated: boolean } {
    const MAX_TOTAL_CHARACTERS = 5800;
    const MAX_PER_EMBED = 1800;
    const sanitized = text && text.length ? text : `(empty)`;
    let working = sanitized;
    let truncated = false;
    if (working.length > MAX_TOTAL_CHARACTERS) {
        working = working.slice(0, MAX_TOTAL_CHARACTERS);
        truncated = true;
    }
    const parts: string[] = chunkString(working, MAX_PER_EMBED);
    const embeds = parts.map((p: string, idx: number) => {
        const note = truncated && idx === parts.length - 1 ? `\n\nPreview trimmed due to Discord limits.` : ``;
        return new EmbedBuilder()
            .setTitle(
                `Description v${version}${isPublic ? ` (public)` : ``}${parts.length > 1 ? ` [${idx + 1}/${parts.length}]` : ``}`,
            )
            .setDescription(`${p}${note}`)
            .setColor(`Blue`);
    });
    return { embeds, truncated };
}
