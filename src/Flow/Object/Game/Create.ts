import { randomUUID } from 'crypto';
import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Properties returned for a Game
 */
export interface Game {
    uid: string;
    name: string;
    image: string;
    serverId: string;
}

/**
 * Generate a unique game UID.
 * @param prefix UID prefix
 * @returns generated UID string
 */
export function generateGameUid(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Create a new Game node linked to a Server. Fails if game name already exists for that server.
 * @param name Game name
 * @param image URL of game image
 * @param serverId Discord server ID
 * @param uid Optional UID; if not provided, a new one is generated
 * @returns The created game properties
 */
export async function createGame(name: string, image: string, serverId: string, uid?: string): Promise<Game> {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        // check existing
        const checkQuery = `
            MATCH (g:Game { name: $name, server_id: $serverId })
            RETURN g LIMIT 1`;
        const checkResult = await session.run(checkQuery, { name, serverId });
        if (checkResult.records.length > 0) {
            throw new Error('Game with this name already exists in the server');
        }
        const gameUid = uid || generateGameUid('game');
        const query = `
            MERGE (s:Server { id: $serverId })
            MERGE (g:Game { uid: $uid })
            SET g.name = $name, g.image = $image, g.server_id = $serverId
            MERGE (s)-[:HAS_GAME]->(g)
            RETURN g, s.id AS srvId`;
        const params = { uid: gameUid, name, image, serverId };
        const result = await session.run(query, params);
        const record = result.records[0];
        const node = record.get('g');
        const props = node.properties;
        return {
            uid: props.uid,
            name: props.name,
            image: props.image,
            serverId: record.get('srvId'),
        };
    } finally {
        await session.close();
    }
}
