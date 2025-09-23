import { neo4jClient } from '../../../Setup/Neo4j.js';
import { Description } from './Create.js';

/**
 * Retrieve description linked to reference.
 * @param uid Description UID
 * @returns Description properties or null
 */
export async function getDescription(uid: string): Promise<Description | null> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const query = `MATCH (d:Description { uid: $uid }) RETURN d`;
        const result = await session.run(query, { uid });
        if (result.records.length === 0) return null;
        const props = result.records[0].get('d').properties;
        return {
            uid: props.uid,
            refType: props.refType,
            refUid: props.refUid,
            text: props.text,
        };
    } finally {
        await session.close();
    }
}
