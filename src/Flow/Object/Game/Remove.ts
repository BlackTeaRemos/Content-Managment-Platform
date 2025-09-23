import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Remove a Game node by UID along with its relationships.
 * @param uid Game UID
 * @returns true if deleted, false if not found
 */
export async function removeGame(uid: string): Promise<boolean> {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        const query = `
            MATCH (g:Game { uid: $uid })
            OPTIONAL MATCH (s)-[r:HAS_GAME]->(g)
            DELETE r, g`;
        const result = await session.run(query, { uid });
        const deletedCount = result.summary.counters.updates().nodesDeleted;
        return deletedCount > 0;
    } finally {
        await session.close();
    }
}
