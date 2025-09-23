import { neo4jClient } from '../../../Setup/Neo4j.js';
import { ViewUser } from '../User/View.js';

/**
 * Organization properties returned by view
 */
export interface ViewOrganization {
    uid: string;
    name: string;
    friendly_name: string;
}

/**
 * Organization with its members
 */
export interface OrganizationWithMembers {
    organization: ViewOrganization;
    users: ViewUser[];
}

/**
 * Retrieve an organization and its members by UID
 * @param uid Organization UID to lookup
 * @returns Organization with members or null if not found
 */
export async function getOrganizationWithMembers(uid: string): Promise<OrganizationWithMembers | null> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const query = `
            MATCH (o:Organization { uid: $uid })
            OPTIONAL MATCH (u:User)-[:BELONGS_TO]->(o)
            RETURN o, collect(u) as users`;
        const res = await session.run(query, { uid });
        const rec = res.records[0];
        if (!rec) {
            return null;
        }
        const orgNode = rec.get('o').properties;
        const users = rec.get('users').map((n: any) => n.properties);
        return {
            organization: {
                uid: orgNode.uid,
                name: orgNode.name,
                friendly_name: orgNode.friendly_name,
            },
            users: users.map((u: any) => ({
                uid: u.uid,
                discord_id: u.discord_id,
                name: u.name,
                friendly_name: u.friendly_name,
                id: u.id,
            })),
        };
    } finally {
        await session.close();
    }
}
