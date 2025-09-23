import { randomUUID } from 'crypto';
import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Properties returned for a Factory
 */
export interface Factory {
    uid: string;
    type: string;
    description: string;
    organizationUid: string;
}

/**
 * Generate a unique factory UID.
 * @param prefix UID prefix
 * @returns generated UID string
 */
export function generateFactoryUid(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Create or update a Factory node linked to an Organization.
 * @param type Factory type
 * @param organizationUid Organization UID to link
 * @param description Factory description
 * @param uid Optional UID; if not provided, a new one is generated
 * @returns The created or updated factory properties
 */
export async function createFactory(
    type: string,
    organizationUid: string,
    description: string,
    uid?: string,
): Promise<Factory> {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        const factoryUid = uid || generateFactoryUid('factory');
        const query = `
            MATCH (o:Organization { uid: $orgUid })
            MERGE (f:Factory { uid: $factoryUid })
            ON CREATE SET f.type = $type, f.description = $desc
            ON MATCH SET f.type = coalesce($type, f.type), f.description = coalesce($desc, f.description)
            MERGE (o)-[:HAS_FACTORY]->(f)
            RETURN f`;
        const params = { orgUid: organizationUid, factoryUid, type, desc: description };
        const result = await session.run(query, params);
        const node = result.records[0]?.get('f');
        const props = node.properties;
        return {
            uid: props.uid,
            type: props.type,
            description: props.description,
            organizationUid,
        };
    } finally {
        await session.close();
    }
}
