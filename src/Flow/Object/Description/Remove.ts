import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Remove a Description node by UID
 * @param uid Description UID
 * @returns true if removed
 */
export async function removeDescription(uid: string): Promise<boolean> {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        const query = `MATCH (d:Description { uid: $uid }) DETACH DELETE d`;
        const result = await session.run(query, { uid });
        const deletedCount = result.summary.counters.updates().nodesDeleted;
        return deletedCount > 0;
    } finally {
        await session.close();
    }
}
