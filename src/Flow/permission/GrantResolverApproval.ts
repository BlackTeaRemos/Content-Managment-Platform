import { neo4jClient } from '../../Setup/Neo4j.js';
import { createUser } from '../Object/User/Create.js';

/**
 * Input arguments for granting resolver approval privileges.
 * @property serverId string Discord guild identifier (example: '123456789').
 * @property discordUserId string Discord user identifier (example: '987654321').
 */
export interface GrantResolverApprovalInput {
    serverId: string;
    discordUserId: string;
}

/**
 * Result payload produced after granting resolver approval privileges.
 * @property userUid string Application user UID (example: 'user_abcd').
 * @property serverId string Discord guild identifier (example: '123456789').
 * @property tokens string[] List of stored permission tokens (example: ['_permission_approval']).
 * @property permissionJson string JSON representation of the permission payload (example: '{"_permission_approval":true}').
 */
export interface GrantResolverApprovalResult {
    userUid: string;
    serverId: string;
    tokens: string[];
    permissionJson: string;
}

/**
 * Ensure the target user exists and attach resolver approval metadata for the given server.
 * @param input GrantResolverApprovalInput Input describing the server and target user (example: { serverId: '123', discordUserId: '456' }).
 * @returns Promise<GrantResolverApprovalResult> Stored permission summary (example: { userUid: 'user_1', serverId: '123', tokens: ['_permission_approval'], permissionJson: '{"_permission_approval":true}' }).
 * @example
 * const approval = await grantResolverApproval({ serverId: '123', discordUserId: '456' });
 */
export async function grantResolverApproval(input: GrantResolverApprovalInput): Promise<GrantResolverApprovalResult> {
    const { serverId, discordUserId } = input;
    if (!serverId) {
        throw new Error(`Server identifier is required`);
    }
    if (!discordUserId) {
        throw new Error(`Discord user identifier is required`);
    }

    const ensuredUser = await createUser(discordUserId);
    const session = await neo4jClient.GetSession(`WRITE`);
    const approvalToken = `_permission_approval`;
    const tokenList = [approvalToken];
    const permissionJson = JSON.stringify({ [approvalToken]: true });
    const timestamp = new Date().toISOString();

    try {
        const result = await session.run(
            `MATCH (u:User { discord_id: $discordId })
             MERGE (s:Server { id: $serverId })
             MERGE (u)-[rel:HAS_PERMISSION_PROFILE]->(s)
             ON CREATE SET rel.created_at = datetime($timestamp), rel.server_id = $serverId
             SET rel.updated_at = datetime($timestamp),
                 rel.permission_json = $permissionJson,
                 rel.tokens = CASE
                     WHEN rel.tokens IS NULL THEN $tokens
                     WHEN ANY(token IN rel.tokens WHERE token = $approverToken) THEN rel.tokens
                     ELSE rel.tokens + $tokens
                 END
             RETURN u.uid AS userUid, s.id AS serverId, rel.tokens AS storedTokens, rel.permission_json AS permissionJson`,
            {
                discordId: discordUserId,
                serverId,
                tokens: tokenList,
                approverToken: approvalToken,
                permissionJson,
                timestamp,
            },
        );

        if (result.records.length === 0) {
            throw new Error(`Failed to store resolver permissions`);
        }

        const record = result.records[0];
        const storedTokens = (record.get(`storedTokens`) as string[] | null) ?? tokenList;
        const storedJson = (record.get(`permissionJson`) as string | null) ?? permissionJson;

        return {
            userUid: (record.get(`userUid`) as string | null) ?? ensuredUser.uid,
            serverId: record.get(`serverId`) as string,
            tokens: storedTokens,
            permissionJson: storedJson,
        };
    } finally {
        await session.close();
    }
}
