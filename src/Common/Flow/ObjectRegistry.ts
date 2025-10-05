import { EmbedBuilder } from 'discord.js';
import { neo4jClient } from '../../Setup/Neo4j.js';
import { getGame } from '../../Flow/Object/Game/View.js';
import { getOrganizationWithMembers } from '../../Flow/Object/Organization/View.js';
import { getUserByUid } from '../../Flow/Object/User/View.js';
import { getFactory } from '../../Flow/Object/Building/View.js';
import { getLatestDescription } from '../../Flow/Object/Description/Latest.js';

export type ObjectTypeKey = 'game' | 'organization' | 'user' | 'building';

export interface ObjectTypeConfig {
    label: string;
    listQuery: string; // must return uid,label columns
}

export const OBJECT_TYPES: Record<ObjectTypeKey, ObjectTypeConfig> = {
    game: {
        label: 'Games',
        listQuery: 'MATCH (g:Game) RETURN g.uid AS uid, g.name AS label',
    },
    organization: {
        label: 'Organizations',
        listQuery: 'MATCH (o:Organization) RETURN o.uid AS uid, o.name AS label',
    },
    user: {
        label: 'Users',
        listQuery: 'MATCH (u:User) RETURN u.uid AS uid, u.discord_id AS label',
    },
    building: {
        label: 'Factories',
        listQuery: 'MATCH (f:Factory) RETURN f.uid AS uid, f.type AS label',
    },
};

export function getSupportedTypes(): Array<{ label: string; value: ObjectTypeKey }> {
    return Object.entries(OBJECT_TYPES).map(([key, cfg]) => ({ label: cfg.label, value: key as ObjectTypeKey }));
}

export async function listRecordsFor(type: ObjectTypeKey): Promise<Array<{ uid: string; label: string }>> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const result = await session.run(OBJECT_TYPES[type].listQuery);
        return result.records.map(r => ({ uid: String(r.get('uid')), label: String(r.get('label')) }));
    } finally {
        await session.close();
    }
}

export async function buildEmbedFor(type: ObjectTypeKey, id: string, orgUid: string | undefined) {
    const embed = new EmbedBuilder().setTitle('Details').setColor('Blue');
    switch (type) {
        case 'game': {
            const g = await getGame(id);
            embed
                .addFields({ name: 'UID', value: g?.uid ?? 'n/a', inline: true })
                .addFields({ name: 'Name', value: g?.name ?? 'n/a', inline: true })
                .addFields({ name: 'Server', value: g?.serverId ?? 'n/a', inline: true });
            const latest = await getLatestDescription('game', id, orgUid || '');
            if (latest?.text) {
                embed.addFields({
                    name: `Description v${latest.version}${latest.isPublic ? ' (public)' : ''}`,
                    value: latest.text.slice(0, 1024),
                });
            }
            break;
        }
        case 'organization': {
            const org = await getOrganizationWithMembers(id);
            if (org) {
                embed
                    .addFields({ name: 'UID', value: org.organization.uid, inline: true })
                    .addFields({ name: 'Name', value: org.organization.name, inline: true })
                    .addFields({ name: 'Friendly', value: org.organization.friendly_name, inline: true })
                    .addFields({ name: 'Members', value: String(org.users.length), inline: true });
                const latest = await getLatestDescription('organization', id, orgUid || '');
                if (latest?.text) {
                    embed.addFields({
                        name: `Description v${latest.version}${latest.isPublic ? ' (public)' : ''}`,
                        value: latest.text.slice(0, 1024),
                    });
                }
            }
            break;
        }
        case 'user': {
            const user = await getUserByUid(id);
            if (user) {
                embed
                    .addFields({ name: 'UID', value: user.uid, inline: true })
                    .addFields({ name: 'Discord', value: user.discord_id, inline: true })
                    .addFields({ name: 'Name', value: user.name || 'n/a', inline: true });
                const latest = await getLatestDescription('user', id, orgUid || '');
                if (latest?.text) {
                    embed.addFields({
                        name: `Description v${latest.version}${latest.isPublic ? ' (public)' : ''}`,
                        value: latest.text.slice(0, 1024),
                    });
                }
            }
            break;
        }
        case 'building': {
            const f = await getFactory(id);
            if (f) {
                embed
                    .addFields({ name: 'UID', value: f.uid, inline: true })
                    .addFields({ name: 'Type', value: f.type, inline: true })
                    .addFields({ name: 'Org', value: f.organizationUid || 'n/a', inline: true });
                // No description linkage defined for building yet
            }
            break;
        }
    }
    return embed;
}
