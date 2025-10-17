/**
 * Utility functions for combining organization membership checks with permission resolution.
 */
import { neo4jClient } from '../../Setup/Neo4j.js';
import { log } from '../Log.js';
import { resolve } from './resolve/resolve.js';
import { collectEnsureTokens } from './resolve/collectEnsureTokens.js';
import type { ResolveEnsureOptions, ResolveEnsureResult, TokenResolveContext } from './resolve/types.js';
import type { TokenSegmentInput } from './types.js';

/**
 * Fetch organization UIDs associated with a Discord user.
 * @param discordId string Discord user identifier (example: '1234567890').
 * @returns Promise<string[]> Array of organization UIDs (example: ['org_abc']).
 * @example
 * const organizations = await fetchUserOrganizationUids('1234567890');
 */
export async function fetchUserOrganizationUids(discordId: string): Promise<string[]> {
    const session = await neo4jClient.GetSession(`READ`);
    try {
        const query = `MATCH (u:User { discord_id: $discordId })-[:BELONGS_TO]->(o:Organization) RETURN o.uid AS uid`;
        const result = await session.run(query, { discordId });
        return result.records.map(record => {
            return String(record.get(`uid`));
        });
    } catch (error) {
        log.error(`Failed to fetch organizations for user ${discordId}: ${String(error)}`, `Permission.orgAccess`);
        throw error;
    } finally {
        await session.close();
    }
}

/**
 * Resolve permissions for an organization-scoped action, bypassing resolver when the user belongs to the organization.
 * @param templates Array<string | TokenSegmentInput[]> Permission templates (example: [['object','building','create']]).
 * @param actorDiscordId string Discord ID of the actor (example: '1234567890').
 * @param organizationUid string | null | undefined Target organization UID (example: 'org_abc').
 * @param options ResolveEnsureOptions Permission resolution options.
 * @returns Promise<ResolveEnsureResult> Resolution outcome.
 * @example
 * const result = await resolveForOrganizationAction([["object","building","create"]], userId, orgUid, { context: { userId } });
 */
export async function resolveForOrganizationAction(
    templates: Array<string | TokenSegmentInput[]>,
    actorDiscordId: string,
    organizationUid: string | null | undefined,
    options: ResolveEnsureOptions = {},
): Promise<ResolveEnsureResult> {
    if (!organizationUid) {
        return resolve(templates, options);
    }
    try {
        const organizations = await fetchUserOrganizationUids(actorDiscordId);
        if (organizations.includes(organizationUid)) {
            const context = (options.context ?? {}) as TokenResolveContext;
            const tokens = collectEnsureTokens(templates, context);
            return { success: true, detail: { tokens, requiresApproval: false } };
        }
    } catch (error) {
        log.error(
            `Organization lookup failed for user ${actorDiscordId} and org ${organizationUid}: ${String(error)}`,
            `Permission.orgAccess`,
        );
        return resolve(templates, options);
    }
    return resolve(templates, options);
}

/**
 * Resolve permissions for a user-scoped action, bypassing resolver when the target user matches the actor.
 * @param templates Array<string | TokenSegmentInput[]> Permission templates (example: [['object','user','create']]).
 * @param actorDiscordId string Discord ID of the actor (example: '1234567890').
 * @param targetDiscordId string | null | undefined Target Discord ID (example: '987654321').
 * @param options ResolveEnsureOptions Permission resolution options.
 * @returns Promise<ResolveEnsureResult> Resolution outcome.
 * @example
 * const result = await resolveForUserAction([["object","user","remove"]], userId, targetUserId, { context: { userId } });
 */
export async function resolveForUserAction(
    templates: Array<string | TokenSegmentInput[]>,
    actorDiscordId: string,
    targetDiscordId: string | null | undefined,
    options: ResolveEnsureOptions = {},
): Promise<ResolveEnsureResult> {
    if (!targetDiscordId || targetDiscordId === actorDiscordId) {
        const context = (options.context ?? {}) as TokenResolveContext;
        const tokens = collectEnsureTokens(templates, context);
        return { success: true, detail: { tokens, requiresApproval: false } };
    }
    return resolve(templates, options);
}
