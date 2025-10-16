import { randomUUID } from 'crypto';
import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Create a User node in Neo4j with the given Discord ID.
 * If a user with the same Discord ID exists, returns existing UID.
 */
export async function createUser(discordId: string): Promise<{ uid: string; discord_id: string }> {
    const session = await neo4jClient.GetSession(`WRITE`);
    try {
        // Generate a unique UID for the user
        const uid = `user_${randomUUID().replace(/-/g, ``)}`;
        const query = `
            MERGE (u:User { discord_id: $discordId })
            ON CREATE SET u.uid = $uid
            RETURN u.uid AS uid, u.discord_id AS discord_id`;
        const result = await session.run(query, { discordId, uid });
        const record = result.records[0];
        return {
            uid: record.get(`uid`),
            discord_id: record.get(`discord_id`),
        };
    } finally {
        await session.close();
    }
}
