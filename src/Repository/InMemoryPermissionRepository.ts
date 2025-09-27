import {
    PermissionRepository,
    PermissionSet,
    PermissionEntry,
    PermissionLevel,
    PermissionContext,
    EphemeralPermissionRequest
} from '../Domain/Permission.js';

/**
 * In-memory implementation of PermissionRepository for initial development.
 * In production, this should be replaced with a persistent storage implementation.
 */
export class InMemoryPermissionRepository implements PermissionRepository {
    private _permissionSets: Map<string, PermissionSet> = new Map();
    private _ephemeralRequests: Map<string, EphemeralPermissionRequest> = new Map();

    /** Generate key for permission set lookup */
    private _generateKey(level: PermissionLevel, context: Partial<PermissionContext>): string {
        const parts: string[] = [level];
        
        if (context.userId) parts.push('user:' + context.userId);
        if (context.organizationId) parts.push('org:' + context.organizationId);
        if (context.guildId) parts.push('guild:' + context.guildId);
        
        return parts.join('|');
    }

    /** Get permission set for a specific level and context */
    async getPermissionSet(level: PermissionLevel, context: Partial<PermissionContext>): Promise<PermissionSet | null> {
        const key = this._generateKey(level, context);
        return this._permissionSets.get(key) || null;
    }

    /** Save/update permission set */
    async savePermissionSet(permissionSet: PermissionSet): Promise<void> {
        const context: Partial<PermissionContext> = {
            userId: permissionSet.userId,
            organizationId: permissionSet.organizationId,
            guildId: permissionSet.serverId
        };
        
        const key = this._generateKey(permissionSet.level, context);
        this._permissionSets.set(key, { ...permissionSet, updatedAt: new Date() });
    }

    /** Add a new permission entry to existing set */
    async addPermission(level: PermissionLevel, context: Partial<PermissionContext>, entry: PermissionEntry): Promise<void> {
        let permissionSet = await this.getPermissionSet(level, context);
        
        if (!permissionSet) {
            // Create new permission set
            permissionSet = {
                level,
                userId: context.userId,
                organizationId: context.organizationId,
                serverId: context.guildId,
                permissions: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }

        // Remove existing permission for the same tag if it exists
        permissionSet.permissions = permissionSet.permissions.filter(p => p.tag !== entry.tag);
        
        // Add new permission
        permissionSet.permissions.push(entry);
        
        await this.savePermissionSet(permissionSet);
    }

    /** Remove permission entry */
    async removePermission(level: PermissionLevel, context: Partial<PermissionContext>, tag: string): Promise<void> {
        const permissionSet = await this.getPermissionSet(level, context);
        
        if (permissionSet) {
            permissionSet.permissions = permissionSet.permissions.filter(p => p.tag !== tag);
            await this.savePermissionSet(permissionSet);
        }
    }

    /** Store ephemeral permission request */
    async storeEphemeralRequest(request: EphemeralPermissionRequest): Promise<void> {
        this._ephemeralRequests.set(request.requestId, request);
    }

    /** Get ephemeral permission request */
    async getEphemeralRequest(requestId: string): Promise<EphemeralPermissionRequest | null> {
        return this._ephemeralRequests.get(requestId) || null;
    }

    /** Remove ephemeral permission request */
    async removeEphemeralRequest(requestId: string): Promise<void> {
        this._ephemeralRequests.delete(requestId);
    }

    /** Get all permission sets (for debugging/admin purposes) */
    async getAllPermissionSets(): Promise<PermissionSet[]> {
        return Array.from(this._permissionSets.values());
    }

    /** Get all active ephemeral requests (for debugging/admin purposes) */
    async getAllEphemeralRequests(): Promise<EphemeralPermissionRequest[]> {
        return Array.from(this._ephemeralRequests.values());
    }

    /** Clear all data (for testing purposes) */
    async clear(): Promise<void> {
        this._permissionSets.clear();
        this._ephemeralRequests.clear();
    }
}