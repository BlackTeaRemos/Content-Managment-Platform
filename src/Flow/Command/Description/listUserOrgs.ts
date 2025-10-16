import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * List organizations a user belongs to.
 * @param discordId string Discord id of the user
 * @returns Promise<Array<{ uid: string; name: string }>>
 */
export async function listUserOrgs(discordId: string) {
    const session = await neo4jClient.GetSession('READ');
    try {
        const res = await session.run(
            'MATCH (u:User { discord_id: $discordId })-[:BELONGS_TO]->(o:Organization) RETURN o.uid AS uid, o.name AS name',
            { discordId },
        );
        return res.records.map(r => ({ uid: String(r.get('uid')), name: String(r.get('name')) }));
    } finally {
        await session.close();
    }
}
