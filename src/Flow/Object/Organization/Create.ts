import { randomUUID } from 'crypto';
import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Generate a unique organization UID.
 * @param prefix UID prefix
 * @returns generated UID string
 */
export function generateUid(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Properties returned for an organization
 */
export interface ViewOrganization {
    uid: string;
    name: string;
    friendly_name: string;
}

/**
 * Create or update an Organization node in Neo4j.
 * @param name Organization name
 * @param friendly_name Friendly name
 * @param uid Optional UID; if not provided, a new one is generated
 * @returns The created or matched organization properties
 */
export async function createOrganization(name: string, friendly_name: string, uid?: string): Promise<ViewOrganization> {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        const orgUid = uid || generateUid('org');
        const query = `
            MERGE (o:Organization { uid: $uid })
            ON CREATE SET o.name = $name, o.friendly_name = $friendly
            ON MATCH SET o.name = coalesce($name, o.name), o.friendly_name = coalesce($friendly, o.friendly_name)
            RETURN o`;
        const result = await session.run(query, { uid: orgUid, name, friendly: friendly_name });
        const node = result.records[0]?.get('o');
        const props = node.properties;
        return {
            uid: props.uid,
            name: props.name,
            friendly_name: props.friendly_name,
        };
    } finally {
        await session.close();
    }
}
