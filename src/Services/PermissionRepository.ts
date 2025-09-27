/**
 * Neo4j-based Permission Repository Implementation
 * Provides persistent storage for the generalized permission system.
 */

import { neo4jClient } from '../Setup/Neo4j.js';
import type { 
    PermissionRepository, 
    PermissionSet, 
    Permission,
    PermissionState 
} from '../Domain/Permission.js';
import { log } from '../Common/Log.js';

export class Neo4jPermissionRepository implements PermissionRepository {
    
    async getPermissionSet(scopeId: string, scopeType: 'user' | 'organization' | 'server'): Promise<PermissionSet | null> {
        const session = await neo4jClient.GetSession('READ');
        try {
            const result = await session.run(
                `
                MATCH (s:${this.getScopeNodeLabel(scopeType)} {${this.getScopeIdProperty(scopeType)}: $scopeId})
                OPTIONAL MATCH (s)-[:HAS_PERMISSION]->(p:Permission)
                RETURN s, collect(p) as permissions
                `,
                { scopeId }
            );

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const scopeNode = record.get('s');
            const permissions = record.get('permissions');

            if (!scopeNode) {
                return null;
            }

            const permissionMap: Record<string, Permission> = {};
            for (const perm of permissions) {
                if (perm) {
                    const props = perm.properties;
                    permissionMap[props.id] = {
                        id: props.id,
                        state: props.state as PermissionState,
                        tags: props.tags || [],
                        expiresAt: props.expiresAt ? new Date(props.expiresAt) : undefined,
                        createdAt: new Date(props.createdAt),
                        updatedAt: new Date(props.updatedAt),
                        grantedBy: props.grantedBy,
                        reason: props.reason
                    };
                }
            }

            return {
                scopeId,
                scopeType,
                permissions: permissionMap,
                lastUpdated: new Date(),
                version: scopeNode.properties.permissionVersion || 1
            };
        } finally {
            await session.close();
        }
    }

    async savePermissionSet(permissionSet: PermissionSet): Promise<void> {
        const session = await neo4jClient.GetSession('WRITE');
        try {
            // Start transaction
            const tx = session.beginTransaction();
            
            try {
                // Update or create scope node
                await tx.run(
                    `
                    MERGE (s:${this.getScopeNodeLabel(permissionSet.scopeType)} {${this.getScopeIdProperty(permissionSet.scopeType)}: $scopeId})
                    SET s.permissionVersion = $version, s.lastUpdated = $lastUpdated
                    `,
                    { 
                        scopeId: permissionSet.scopeId, 
                        version: permissionSet.version + 1,
                        lastUpdated: new Date().toISOString()
                    }
                );

                // Remove existing permissions
                await tx.run(
                    `
                    MATCH (s:${this.getScopeNodeLabel(permissionSet.scopeType)} {${this.getScopeIdProperty(permissionSet.scopeType)}: $scopeId})-[r:HAS_PERMISSION]->(p:Permission)
                    DELETE r, p
                    `,
                    { scopeId: permissionSet.scopeId }
                );

                // Add new permissions
                for (const [permId, permission] of Object.entries(permissionSet.permissions)) {
                    await tx.run(
                        `
                        MATCH (s:${this.getScopeNodeLabel(permissionSet.scopeType)} {${this.getScopeIdProperty(permissionSet.scopeType)}: $scopeId})
                        CREATE (p:Permission {
                            id: $permId,
                            state: $state,
                            tags: $tags,
                            expiresAt: $expiresAt,
                            createdAt: $createdAt,
                            updatedAt: $updatedAt,
                            grantedBy: $grantedBy,
                            reason: $reason
                        })
                        CREATE (s)-[:HAS_PERMISSION]->(p)
                        `,
                        {
                            scopeId: permissionSet.scopeId,
                            permId,
                            state: permission.state,
                            tags: permission.tags || [],
                            expiresAt: permission.expiresAt?.toISOString(),
                            createdAt: permission.createdAt.toISOString(),
                            updatedAt: permission.updatedAt.toISOString(),
                            grantedBy: permission.grantedBy,
                            reason: permission.reason
                        }
                    );
                }

                await tx.commit();
            } catch (error) {
                await tx.rollback();
                throw error;
            }
        } finally {
            await session.close();
        }
    }

    async getPermission(scopeId: string, scopeType: 'user' | 'organization' | 'server', permissionId: string): Promise<Permission | null> {
        const session = await neo4jClient.GetSession('READ');
        try {
            const result = await session.run(
                `
                MATCH (s:${this.getScopeNodeLabel(scopeType)} {${this.getScopeIdProperty(scopeType)}: $scopeId})-[:HAS_PERMISSION]->(p:Permission {id: $permissionId})
                RETURN p
                `,
                { scopeId, permissionId }
            );

            if (result.records.length === 0) {
                return null;
            }

            const props = result.records[0].get('p').properties;
            return {
                id: props.id,
                state: props.state as PermissionState,
                tags: props.tags || [],
                expiresAt: props.expiresAt ? new Date(props.expiresAt) : undefined,
                createdAt: new Date(props.createdAt),
                updatedAt: new Date(props.updatedAt),
                grantedBy: props.grantedBy,
                reason: props.reason
            };
        } finally {
            await session.close();
        }
    }

    async savePermission(scopeId: string, scopeType: 'user' | 'organization' | 'server', permission: Permission): Promise<void> {
        const session = await neo4jClient.GetSession('WRITE');
        try {
            await session.run(
                `
                MERGE (s:${this.getScopeNodeLabel(scopeType)} {${this.getScopeIdProperty(scopeType)}: $scopeId})
                MERGE (s)-[:HAS_PERMISSION]->(p:Permission {id: $permissionId})
                SET p.state = $state,
                    p.tags = $tags,
                    p.expiresAt = $expiresAt,
                    p.createdAt = $createdAt,
                    p.updatedAt = $updatedAt,
                    p.grantedBy = $grantedBy,
                    p.reason = $reason
                `,
                {
                    scopeId,
                    permissionId: permission.id,
                    state: permission.state,
                    tags: permission.tags || [],
                    expiresAt: permission.expiresAt?.toISOString(),
                    createdAt: permission.createdAt.toISOString(),
                    updatedAt: permission.updatedAt.toISOString(),
                    grantedBy: permission.grantedBy,
                    reason: permission.reason
                }
            );
        } finally {
            await session.close();
        }
    }

    async deletePermission(scopeId: string, scopeType: 'user' | 'organization' | 'server', permissionId: string): Promise<void> {
        const session = await neo4jClient.GetSession('WRITE');
        try {
            await session.run(
                `
                MATCH (s:${this.getScopeNodeLabel(scopeType)} {${this.getScopeIdProperty(scopeType)}: $scopeId})-[r:HAS_PERMISSION]->(p:Permission {id: $permissionId})
                DELETE r, p
                `,
                { scopeId, permissionId }
            );
        } finally {
            await session.close();
        }
    }

    async isUserAdmin(userId: string, guildId: string): Promise<boolean> {
        const session = await neo4jClient.GetSession('READ');
        try {
            // Check if user has admin permission or admin role
            const result = await session.run(
                `
                MATCH (u:User {discord_id: $userId})
                OPTIONAL MATCH (u)-[:HAS_PERMISSION]->(p:Permission {id: "admin"})
                OPTIONAL MATCH (g:Organization {id: $guildId})-[:HAS_ADMIN]->(u)
                RETURN 
                    CASE 
                        WHEN p.state = "allowed" THEN true
                        WHEN g IS NOT NULL THEN true
                        ELSE false 
                    END as isAdmin
                `,
                { userId, guildId }
            );

            return result.records.length > 0 ? result.records[0].get('isAdmin') : false;
        } finally {
            await session.close();
        }
    }

    async getAdminUsers(guildId: string): Promise<string[]> {
        const session = await neo4jClient.GetSession('READ');
        try {
            const result = await session.run(
                `
                MATCH (g:Organization {id: $guildId})-[:HAS_ADMIN]->(u:User)
                RETURN u.discord_id as userId
                UNION
                MATCH (u:User)-[:HAS_PERMISSION]->(p:Permission {id: "admin", state: "allowed"})
                RETURN u.discord_id as userId
                `,
                { guildId }
            );

            return result.records.map(record => record.get('userId'));
        } finally {
            await session.close();
        }
    }

    private getScopeNodeLabel(scopeType: 'user' | 'organization' | 'server'): string {
        switch (scopeType) {
            case 'user': return 'User';
            case 'organization': return 'Organization';
            case 'server': return 'Server';
            default: throw new Error(`Unknown scope type: ${scopeType}`);
        }
    }

    private getScopeIdProperty(scopeType: 'user' | 'organization' | 'server'): string {
        switch (scopeType) {
            case 'user': return 'discord_id';
            case 'organization': return 'id';
            case 'server': return 'id';
            default: throw new Error(`Unknown scope type: ${scopeType}`);
        }
    }
}

// Singleton instance
export const permissionRepository = new Neo4jPermissionRepository();