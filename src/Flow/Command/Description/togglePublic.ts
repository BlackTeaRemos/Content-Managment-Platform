import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Toggle the public visibility flag on the latest description for a reference.
 * @param refType 'organization' | 'game' | 'user'
 * @param refUid string Reference unique id
 * @param orgUid string Owning organization id
 * @param isPublic boolean New visibility state
 */
export async function togglePublic(
    refType: `organization` | `game` | `user`,
    refUid: string,
    orgUid: string,
    isPublic: boolean,
) {
    const session = await neo4jClient.GetSession(`WRITE`);
    try {
        const q = `MATCH (d:Description { refType: $refType, refUid: $refUid, orgUid: $orgUid })\n                   WITH d ORDER BY d.version DESC LIMIT 1\n                   SET d.isPublic = $isPublic RETURN d`;
        await session.run(q, { refType, refUid, orgUid, isPublic });
    } finally {
        await session.close();
    }
}
