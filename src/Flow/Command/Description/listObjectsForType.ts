import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * List selectable objects of the provided type for building select menu options.
 * @param type 'organization' | 'game' | 'user'
 * @returns Promise<Array<{ uid: string; label: string }>>
 */
export async function listObjectsForType(type: 'organization' | 'game' | 'user') {
    const session = await neo4jClient.GetSession('READ');
    try {
        const queries: Record<string, string> = {
            organization: 'MATCH (o:Organization) RETURN o.uid AS uid, o.name AS label',
            game: 'MATCH (g:Game) RETURN g.uid AS uid, g.name AS label',
            user: 'MATCH (u:User) RETURN u.uid AS uid, u.discord_id AS label',
        };
        const q = queries[type];
        const res = await session.run(q);
        return res.records.map(r => ({ uid: String(r.get('uid')), label: String(r.get('label')) }));
    } finally {
        await session.close();
    }
}
