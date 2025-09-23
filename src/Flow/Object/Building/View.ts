import { neo4jClient } from '../../../Setup/Neo4j.js';
import { Factory } from './Create.js';

/**
 * Retrieve a Factory node by UID along with its organization reference.
 * @param uid Factory UID
 * @returns Factory properties or null if not found
 */
export async function getFactory(uid: string): Promise<Factory | null> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const query = `
            MATCH (f:Factory { uid: $uid })
            OPTIONAL MATCH (o:Organization)-[:HAS_FACTORY]->(f)
            RETURN f, o.uid AS orgUid`;
        const result = await session.run(query, { uid });
        const record = result.records[0];
        if (!record) {
            return null;
        }
        const node = record.get('f');
        const props = node.properties;
        const orgUid = record.get('orgUid') as string | null;
        return {
            uid: props.uid,
            type: props.type,
            description: props.description,
            organizationUid: orgUid || '',
        };
    } finally {
        await session.close();
    }
}
