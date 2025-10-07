import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Properties returned for a user view
 */
export interface ViewUser {
    uid: string;
    discord_id: string;
    name: string;
    friendly_name: string;
    id: string;
}

/**
 * Retrieve all users from the database, ordered by name
 */
export async function listUsers(): Promise<ViewUser[]> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const res = await session.run(
            `
            MATCH (u:User)
            RETURN u
            ORDER BY u.name
            `,
        );
        return res.records.map(record => {
            const props = record.get('u').properties;
            return {
                uid: props.uid,
                discord_id: props.discord_id,
                name: props.name,
                friendly_name: props.friendly_name,
                id: props.id,
            };
        });
    } finally {
        await session.close();
    }
}

/**
 * Retrieve a single user by Discord ID
 * @param discordId The Discord user ID to lookup
 * @returns The user properties or null if not found
 */
export async function getUserByDiscordId(discordId: string): Promise<ViewUser | null> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const res = await session.run(
            `
            MATCH (u:User { discord_id: $discordId })
            RETURN u
            `,
            { discordId },
        );
        if (res.records.length === 0) {
            return null;
        }
        const props = res.records[0].get('u').properties;
        return {
            uid: props.uid,
            discord_id: props.discord_id,
            name: props.name,
            friendly_name: props.friendly_name,
            id: props.id,
        };
    } finally {
        await session.close();
    }
}

/**
 * Retrieve a single user by UID
 * @param uid The UID to lookup
 * @returns The user properties or null if not found
 */
export async function getUserByUid(uid: string): Promise<ViewUser | null> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const res = await session.run(
            `
            MATCH (u:User { uid: $uid })
            RETURN u
            `,
            { uid },
        );
        if (res.records.length === 0) {
            return null;
        }
        const props = res.records[0].get('u').properties;
        return {
            uid: props.uid,
            discord_id: props.discord_id,
            name: props.name,
            friendly_name: props.friendly_name,
            id: props.id,
        };
    } finally {
        await session.close();
    }
}
