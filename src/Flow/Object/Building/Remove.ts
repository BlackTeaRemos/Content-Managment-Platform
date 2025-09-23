import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Remove a Factory node by UID along with its relationships.
 * @param uid Factory UID
 * @returns true if deleted, false if not found
 */
export async function removeFactory(uid: string): Promise<boolean> {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        const query = `
            MATCH (f:Factory { uid: $uid })
            WITH f
            OPTIONAL MATCH (o)-[r:HAS_FACTORY]->(f)
            DELETE r, f`;
        const result = await session.run(query, { uid });
        // result.summary.counters.updates().nodesDeleted etc.
        const deletedCount = result.summary.counters.updates().nodesDeleted;
        return deletedCount > 0;
    } finally {
        await session.close();
    }
}
