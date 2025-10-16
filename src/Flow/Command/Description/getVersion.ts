import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * Retrieve a specific version of a description.
 * @param refType 'organization' | 'game' | 'user'
 * @param refUid string Reference unique id
 * @param orgUid string Owning organization id
 * @param version number Version to load
 * @returns Promise<{ text: string; version: number; isPublic: boolean } | null>
 */
export async function getVersion(
    refType: `organization` | `game` | `user`,
    refUid: string,
    orgUid: string,
    version: number,
) {
    const session = await neo4jClient.GetSession(`READ`);
    try {
        const q = `MATCH (d:Description { refType: $refType, refUid: $refUid, orgUid: $orgUid, version: $version }) RETURN d`;
        const res = await session.run(q, { refType, refUid, orgUid, version });
        if (!res.records.length) {
            return null;
        }
        const props = res.records[0].get(`d`).properties;
        return { text: String(props.text), version: Number(props.version), isPublic: Boolean(props.isPublic) };
    } finally {
        await session.close();
    }
}
