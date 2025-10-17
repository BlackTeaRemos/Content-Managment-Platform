import { Guild, GuildMember } from 'discord.js';
import { log } from '../../Common/Log.js';
import { neo4jClient } from '../../Setup/Neo4j.js';

const RESOLVER_TOKEN = `_permission_approval`;

export async function loadResolverMembers(guild: Guild): Promise<GuildMember[]> {
    const session = await neo4jClient.GetSession(`READ`);
    let resolverIds: string[] = [];
    try {
        const result = await session.run(
            `MATCH (u:User)-[rel:HAS_PERMISSION_PROFILE]->(s:Server { id: $serverId })
             WHERE (rel.tokens IS NOT NULL AND ANY(token IN rel.tokens WHERE token = $token))
                OR (rel.permission_json IS NOT NULL AND rel.permission_json CONTAINS $tokenJsonFragment)
             RETURN DISTINCT u.discord_id AS discordId`,
            {
                serverId: guild.id,
                token: RESOLVER_TOKEN,
                tokenJsonFragment: `"${RESOLVER_TOKEN}":true`,
            },
        );

        resolverIds = result.records
            .map(record => {
                const value = record.get(`discordId`);
                return value ? String(value) : ``;
            })
            .filter(Boolean);
    } catch (error) {
        log.error(`Permission request: failed to load resolvers from DB: ${String(error)}`, `PermissionUI`);
    } finally {
        await session.close();
    }

    if (!resolverIds.length) {
        return [];
    }

    const uniqueIds = Array.from(new Set(resolverIds));
    const members: GuildMember[] = [];
    for (const discordId of uniqueIds) {
        try {
            const member = await guild.members.fetch({ user: discordId });
            if (!member.user.bot) {
                members.push(member);
            }
        } catch (error) {
            log.warning(
                `Permission request: failed to fetch resolver member ${discordId}: ${String(error)}`,
                `PermissionUI`,
            );
        }
    }

    return members;
}