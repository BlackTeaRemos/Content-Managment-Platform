import { randomUUID } from 'crypto';
import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Description object properties
 */
export interface Description {
    uid: string;
    refType: 'organization' | 'game' | 'user';
    refUid: string;
    text: string;
}

/**
 * Create a Description node linked to a reference object.
 * @param refType Type of reference ('organization'|'game'|'user')
 * @param refUid UID of reference node
 * @param text Description text
 * @param uid Optional UID; if not provided, a new one is generated
 * @returns The created description properties
 */
export async function createDescription(
    refType: 'organization' | 'game' | 'user',
    refUid: string,
    text: string,
    uid?: string,
): Promise<Description> {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        const descUid = uid || `desc_${randomUUID().replace(/-/g, '')}`;
        let matchClause = '';
        switch (refType) {
            case 'organization':
                matchClause = `MATCH (o:Organization { uid: $refUid })`;
                break;
            case 'game':
                matchClause = `MATCH (g:Game { uid: $refUid })`;
                break;
            case 'user':
                matchClause = `MATCH (u:User { uid: $refUid })`;
                break;
        }
        const query = `
            ${matchClause}
            MERGE (d:Description { uid: $descUid })
            SET d.refType = $refType, d.refUid = $refUid, d.text = $text
            ${refType === 'organization' ? 'MERGE (o)-[:HAS_DESCRIPTION]->(d)' : ''}
            ${refType === 'game' ? 'MERGE (g)-[:HAS_DESCRIPTION]->(d)' : ''}
            ${refType === 'user' ? 'MERGE (u)-[:HAS_DESCRIPTION]->(d)' : ''}
            RETURN d`;
        const params = { descUid, refType, refUid, text };
        const result = await session.run(query, params);
        const node = result.records[0].get('d');
        const props = node.properties;
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
