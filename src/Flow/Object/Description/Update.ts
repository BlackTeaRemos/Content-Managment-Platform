import { randomUUID } from 'crypto';
import { neo4jClient } from '../../../Setup/Neo4j.js';

export interface CreatedVersion {
    uid: string;
    version: number;
    text: string;
    isPublic: boolean;
}

/**
 * Create a new version of a description under the given org scope.
 * Properties captured: creator (discord id), createdAt timestamp, version auto-increment.
 */
export async function createDescriptionVersion(
    refType: 'organization' | 'game' | 'user',
    refUid: string,
    orgUid: string,
    text: string,
    creatorDiscordId: string,
): Promise<CreatedVersion> {
    const session = await neo4jClient.GetSession('WRITE');
    try {
        const uid = `desc_${randomUUID().replace(/-/g, '')}`;
        const now = new Date().toISOString();
        const query = `
            // Determine next version number in scope
            OPTIONAL MATCH (dprev:Description { refType: $refType, refUid: $refUid, orgUid: $orgUid })
            WITH coalesce(max(dprev.version), 0) AS lastVer
            CREATE (d:Description {
                uid: $uid,
                refType: $refType,
                refUid: $refUid,
                orgUid: $orgUid,
                text: $text,
                version: lastVer + 1,
                createdBy: $creator,
                createdAt: $createdAt,
                isPublic: false
            })
            WITH d
            WITH d
            CALL {
                WITH d
                MATCH (o:Organization { uid: $refUid })
                WHERE $refType = 'organization'
                MERGE (o)-[:HAS_DESCRIPTION]->(d)
                RETURN 1 AS linked
                UNION
                WITH d
                MATCH (g:Game { uid: $refUid })
                WHERE $refType = 'game'
                MERGE (g)-[:HAS_DESCRIPTION]->(d)
                RETURN 1 AS linked
                UNION
                WITH d
                MATCH (u:User { uid: $refUid })
                WHERE $refType = 'user'
                MERGE (u)-[:HAS_DESCRIPTION]->(d)
                RETURN 1 AS linked
            }
            RETURN d`;

        const res = await session.run(query, {
            uid,
            refType,
            refUid,
            orgUid,
            text,
            creator: creatorDiscordId,
            createdAt: now,
        });
        const props = res.records[0].get('d').properties;
        return {
            uid: String(props.uid),
            version: Number(props.version),
            text: String(props.text),
            isPublic: Boolean(props.isPublic),
        };
    } finally {
        await session.close();
    }
}
