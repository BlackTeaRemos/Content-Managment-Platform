import { neo4jClient } from '../../../Setup/Neo4j.js';

export interface VersionedDescription {
    refType: `organization` | `game` | `user`;
    refUid: string;
    orgUid: string;
    version: number;
    text: string;
    isPublic: boolean;
    createdBy: string;
    createdAt: string;
    uid: string;
}

/**
 * Get the latest description for a given reference and organization scope.
 * If not found for the org, fallback to the latest public description for the reference.
 * @param refType organization|game|user
 * @param refUid reference uid
 * @param orgUid organization uid
 */
export async function getLatestDescription(
    refType: `organization` | `game` | `user`,
    refUid: string,
    orgUid: string,
): Promise<Pick<VersionedDescription, `text` | `version` | `isPublic`> | null> {
    const session = await neo4jClient.GetSession(`READ`);
    try {
        // Try org-scoped first
        const q1 = `MATCH (d:Description { refType: $refType, refUid: $refUid, orgUid: $orgUid })
                    RETURN d ORDER BY d.version DESC LIMIT 1`;
        const r1 = await session.run(q1, { refType, refUid, orgUid });
        if (r1.records.length) {
            const p = r1.records[0].get(`d`).properties;
            return { text: String(p.text), version: Number(p.version ?? 1), isPublic: Boolean(p.isPublic) };
        }
        // Fallback to latest public
        const q2 = `MATCH (d:Description { refType: $refType, refUid: $refUid, isPublic: true })
                    RETURN d ORDER BY d.version DESC LIMIT 1`;
        const r2 = await session.run(q2, { refType, refUid });
        if (r2.records.length) {
            const p = r2.records[0].get(`d`).properties;
            return { text: String(p.text), version: Number(p.version ?? 1), isPublic: Boolean(p.isPublic) };
        }
        return null;
    } finally {
        await session.close();
    }
}
