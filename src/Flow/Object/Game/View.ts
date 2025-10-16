import { neo4jClient } from '../../../Setup/Neo4j.js';
import { Game } from './Create.js';

/**
 * Retrieve a Game node by UID along with its server reference.
 * @param uid Game UID
 * @returns Game properties or null if not found
 */
export async function getGame(uid: string): Promise<Game | null> {
    const session = await neo4jClient.GetSession(`READ`);
    try {
        const query = `
            MATCH (g:Game { uid: $uid })
            OPTIONAL MATCH (s:Server)-[:HAS_GAME]->(g)
            RETURN g, s.id AS srvId`;
        const result = await session.run(query, { uid });
        const record = result.records[0];
        if (!record) {
            return null;
        }
        const node = record.get(`g`);
        const props = node.properties;
        const srvId = record.get(`srvId`) as string | null;
        return {
            uid: props.uid,
            name: props.name,
            image: props.image,
            serverId: srvId || ``,
        };
    } finally {
        await session.close();
    }
}
