import { 
    PermissionManager, 
    PermissionRepository, 
    PermissionContext, 
    PermissionResult, 
    PermissionSet, 
    PermissionEntry, 
    PermissionLevel, 
    PermissionState,
    EphemeralPermissionRequest,
    EphemeralPermissionResponse
} from '../Domain/Permission.js';
import { MAIN_EVENT_BUS } from '../Events/MainEventBus.js';
import { EVENT_NAMES } from '../Domain/Utility.js';
import { log } from '../Common/Log.js';
import { randomUUID } from 'crypto';

/**
 * PermissionService implements the generalized permission system with lazy evaluation
 * and hierarchical permission checking.
 */
export class PermissionService implements PermissionManager {
    private readonly _repository: PermissionRepository;
    private readonly _ephemeralRequestTTL: number = 30 * 60 * 1000; // 30 minutes
    private readonly _permissionLevelPriority: Record<PermissionLevel, number> = {
        'admin': 4,
        'user': 3,
        'organization': 2,
        'server': 1
    };

    constructor(repository: PermissionRepository) {
        this._repository = repository;
    }

    /** Evaluate permissions for given context and tags */
    async evaluate(context: PermissionContext): Promise<PermissionResult> {
        log.debug(`Evaluating permissions for user ${context.userId} with tags: ${context.requiredTags.join(', ')}`, 'PermissionService');

        // Step 0: Check if user is admin
        if (context.isAdmin || await this.isAdmin(context.userId, context.guildId)) {
            return {
                allowed: true,
                level: 'admin',
                matchedPermissions: context.requiredTags.map(tag => ({
                    tag,
                    state: 'allowed',
                    grantedBy: 'system',
                    grantedAt: new Date(),
                    reason: 'Admin privileges'
                })),
                missingTags: [],
                reasons: ['Admin privileges granted']
            };
        }

        // Get permission sets for all levels in priority order
        const levels: PermissionLevel[] = ['user', 'organization', 'server'];
        const permissionSets: (PermissionSet | null)[] = await Promise.all([
            this._repository.getPermissionSet('user', { userId: context.userId, guildId: context.guildId }),
            this._repository.getPermissionSet('organization', { organizationId: context.organizationId, guildId: context.guildId }),
            this._repository.getPermissionSet('server', { guildId: context.guildId })
        ]);

        let grantingLevel: PermissionLevel = 'server';
        const matchedPermissions: PermissionEntry[] = [];
        const missingTags: string[] = [];
        const reasons: string[] = [];

        // Evaluate each required tag
        for (const requiredTag of context.requiredTags) {
            let tagPermission: PermissionEntry | null = null;
            let foundLevel: PermissionLevel = 'server';

            // Check permissions in priority order (user > organization > server)
            for (let i = 0; i < levels.length; i++) {
                const level = levels[i];
                const permissionSet = permissionSets[i];
                
                if (permissionSet) {
                    const permission = permissionSet.permissions.find(p => p.tag === requiredTag);
                    if (permission) {
                        // Check if permission is still valid (not expired)
                        if (permission.expiresAt && permission.expiresAt < new Date()) {
                            continue; // Permission expired, check next level
                        }
                        
                        tagPermission = permission;
                        foundLevel = level;
                        break; // Higher priority level found, stop searching
                    }
                }
            }

            if (tagPermission) {
                matchedPermissions.push(tagPermission);
                
                if (tagPermission.state === 'forbidden') {
                    // Forbidden takes precedence - immediately fail
                    return {
                        allowed: false,
                        level: foundLevel,
                        matchedPermissions: [tagPermission],
                        missingTags: [],
                        reasons: [`Permission denied for tag '${requiredTag}' by ${foundLevel} level policy`]
                    };
                }
                
                if (tagPermission.state === 'once') {
                    // Mark for removal after this execution
                    reasons.push(`One-time permission for tag '${requiredTag}' will be consumed`);
                    // Remove the 'once' permission after use
                    await this._repository.removePermission(foundLevel, { 
                        userId: context.userId, 
                        guildId: context.guildId,
                        organizationId: context.organizationId 
                    }, requiredTag);
                }
                
                grantingLevel = foundLevel;
            } else {
                // No permission found for this tag
                missingTags.push(requiredTag);
            }
        }

        const allowed = missingTags.length === 0;
        
        if (!allowed) {
            reasons.push(`Missing permissions for tags: ${missingTags.join(', ')}`);
        }

        const result: PermissionResult = {
            allowed,
            level: grantingLevel,
            matchedPermissions,
            missingTags,
            reasons,
            requiresEphemeralGrant: !allowed && missingTags.length > 0
        };

        // Log permission decision
        log.info(`Permission evaluation for user ${context.userId}: ${allowed ? 'ALLOWED' : 'DENIED'} at ${grantingLevel} level`, 'PermissionService');
        
        return result;
    }

    /** Grant permission for specific tags */
    async grant(
        level: PermissionLevel, 
        context: Partial<PermissionContext>, 
        tags: string[], 
        state: PermissionState, 
        grantedBy: string,
        reason?: string
    ): Promise<void> {
        for (const tag of tags) {
            const entry: PermissionEntry = {
                tag,
                state,
                grantedBy,
                grantedAt: new Date(),
                reason
            };

            await this._repository.addPermission(level, context, entry);
            
            log.info(`Permission granted: ${state} for tag '${tag}' to user ${context.userId} by ${grantedBy} at ${level} level`, 'PermissionService');
        }

        // Emit event for permission grant
        MAIN_EVENT_BUS.Emit(EVENT_NAMES.permissionGranted, {
            level,
            tags,
            state,
            grantedBy,
            context,
            reason
        });
    }

    /** Revoke permission for specific tags */
    async revoke(level: PermissionLevel, context: Partial<PermissionContext>, tags: string[]): Promise<void> {
        for (const tag of tags) {
            await this._repository.removePermission(level, context, tag);
            log.info(`Permission revoked for tag '${tag}' from user ${context.userId} at ${level} level`, 'PermissionService');
        }

        // Emit event for permission revocation
        MAIN_EVENT_BUS.Emit(EVENT_NAMES.permissionRevoked, {
            level,
            tags,
            context
        });
    }

    /** Request ephemeral permission grant */
    async requestEphemeralGrant(context: PermissionContext, commandDescription: string, error: string): Promise<string> {
        const requestId = randomUUID();
        const request: EphemeralPermissionRequest = {
            requestId,
            userId: context.userId,
            guildId: context.guildId,
            requiredTags: context.requiredTags,
            commandDescription,
            errorReceived: error,
            requestedAt: new Date(),
            expiresAt: new Date(Date.now() + this._ephemeralRequestTTL)
        };

        await this._repository.storeEphemeralRequest(request);
        
        // Emit event to notify permission granters
        MAIN_EVENT_BUS.Emit(EVENT_NAMES.permissionEphemeralRequest, request);
        
        log.info(`Ephemeral permission request created: ${requestId} for user ${context.userId} with tags: ${context.requiredTags.join(', ')}`, 'PermissionService');
        
        return requestId;
    }

    /** Respond to ephemeral permission request */
    async respondToEphemeralRequest(requestId: string, response: EphemeralPermissionResponse): Promise<void> {
        const request = await this._repository.getEphemeralRequest(requestId);
        if (!request) {
            throw new Error(`Ephemeral permission request not found: ${requestId}`);
        }

        // Check if request has expired
        if (request.expiresAt < new Date()) {
            await this._repository.removeEphemeralRequest(requestId);
            throw new Error(`Ephemeral permission request expired: ${requestId}`);
        }

        switch (response.action) {
            case 'approve_once':
                await this.grant('user', { 
                    userId: request.userId, 
                    guildId: request.guildId 
                }, request.requiredTags, 'once', response.granterId, 'Ephemeral grant - once');
                break;
                
            case 'approve_forever':
                await this.grant('user', { 
                    userId: request.userId, 
                    guildId: request.guildId 
                }, request.requiredTags, 'allowed', response.granterId, 'Ephemeral grant - permanent');
                break;
                
            case 'silence':
                // TODO: Implement silence functionality with duration
                log.info(`Ephemeral request silenced by ${response.granterId} for ${response.duration || 60} minutes`, 'PermissionService');
                break;
                
            case 'cancel':
                log.info(`Ephemeral request cancelled by ${response.granterId}`, 'PermissionService');
                break;
        }

        // Remove the request
        await this._repository.removeEphemeralRequest(requestId);
        
        // Emit response event
        MAIN_EVENT_BUS.Emit(EVENT_NAMES.permissionEphemeralResponse, { request, response });
        
        log.info(`Ephemeral permission request ${requestId} resolved with action: ${response.action}`, 'PermissionService');
    }

    /** Check if user is admin */
    async isAdmin(userId: string, guildId: string): Promise<boolean> {
        // TODO: Implement admin check logic based on your system's admin roles
        // This is a placeholder implementation
        const adminPermissionSet = await this._repository.getPermissionSet('admin', { userId, guildId });
        return adminPermissionSet !== null;
    }
}