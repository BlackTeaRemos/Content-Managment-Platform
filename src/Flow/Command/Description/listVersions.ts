import { neo4jClient } from '../../../Setup/Neo4j.js';

/**
 * List available version numbers for a description reference.
 * @param refType 'organization' | 'game' | 'user'
 * @param refUid string Reference unique id
 * @param orgUid string Owning organization id
 * @returns Promise<number[]> Sorted list of version numbers (desc)
 */
export async function listVersions(
    refType: 'organization' | 'game' | 'user',
    refUid: string,
    orgUid: string,
): Promise<number[]> {
    const session = await neo4jClient.GetSession('READ');
    try {
        const q = `MATCH (d:Description { refType: $refType, refUid: $refUid, orgUid: $orgUid }) RETURN d.version as v ORDER BY v DESC`;
        const res = await session.run(q, { refType, refUid, orgUid });
        return res.records.map(r => Number(r.get('v')));
    } finally {
        await session.close();
    }
}
