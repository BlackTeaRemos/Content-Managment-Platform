/**
 * Ephemeral Permission Manager
 * Manages temporary permission requests and admin notifications.
 */

import type {
    EphemeralPermissionManager,
    EphemeralPermissionGrant,
    PermissionContext,
    PermissionRequest,
    PermissionRepository,
    Permission
} from '../Domain/Permission.js';
import { PermissionState } from '../Domain/Permission.js';
import { log } from '../Common/Log.js';
import { randomUUID } from 'crypto';

interface EphemeralRequestStore {
    [requestId: string]: EphemeralPermissionGrant;
}

interface SilencedRequest {
    userId: string;
    guildId: string;
    permissionId: string;
    silencedUntil: Date;
    adminUserId: string;
}

export class DefaultEphemeralPermissionManager implements EphemeralPermissionManager {
    private requestStore: EphemeralRequestStore = {};
    private silencedRequests: Map<string, SilencedRequest> = new Map();
    private readonly REQUEST_EXPIRY_MINUTES = 30; // 30 minute expiry
    private readonly DEFAULT_SILENCE_HOURS = 24; // 24 hour silence

    constructor(private repository: PermissionRepository) {
        // Set up periodic cleanup
        setInterval(() => this.cleanupExpiredRequests(), 5 * 60 * 1000); // every 5 minutes
    }

    async createPermissionRequest(
        context: PermissionContext,
        request: PermissionRequest,
        commandId: string,
        errorMessage: string
    ): Promise<EphemeralPermissionGrant> {
        
        // Check if this type of request is silenced
        const silenceKey = `${context.userId}:${context.guildId}:${request.commandPermission}`;
        const silenced = this.silencedRequests.get(silenceKey);
        
        if (silenced && silenced.silencedUntil > new Date()) {
            log.info(`Permission request silenced`, 'EphemeralPermissionManager',
                JSON.stringify({
                    userId: context.userId,
                    guildId: context.guildId,
                    permission: request.commandPermission,
                    silencedBy: silenced.adminUserId,
                    silencedUntil: silenced.silencedUntil
                })
            );
            
            throw new Error(`Permission requests for ${request.commandPermission} are silenced until ${silenced.silencedUntil.toISOString()}`);
        }

        const grantRequest: EphemeralPermissionGrant = {
            id: randomUUID(),
            requestingUserId: context.userId,
            permissionRequest: request,
            context,
            commandId,
            errorMessage,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + this.REQUEST_EXPIRY_MINUTES * 60 * 1000),
            status: 'pending'
        };

        this.requestStore[grantRequest.id] = grantRequest;

        log.info(`Created ephemeral permission request`, 'EphemeralPermissionManager',
            JSON.stringify({
                requestId: grantRequest.id,
                userId: context.userId,
                guildId: context.guildId,
                commandId,
                permission: request.commandPermission
            })
        );

        // TODO: Send notification to admin users
        await this.notifyAdmins(grantRequest);

        return grantRequest;
    }

    async getPendingRequests(guildId: string): Promise<EphemeralPermissionGrant[]> {
        const pending = Object.values(this.requestStore).filter(
            req => req.context.guildId === guildId && 
                   req.status === 'pending' && 
                   req.expiresAt > new Date()
        );

        return pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    async respondToRequest(
        requestId: string,
        adminUserId: string,
        response: 'approve_once' | 'approve_forever' | 'deny' | 'silence'
    ): Promise<void> {
        const request = this.requestStore[requestId];
        
        if (!request) {
            throw new Error(`Permission request ${requestId} not found`);
        }

        if (request.status !== 'pending') {
            throw new Error(`Permission request ${requestId} is no longer pending`);
        }

        if (request.expiresAt < new Date()) {
            request.status = 'expired';
            throw new Error(`Permission request ${requestId} has expired`);
        }

        // Verify admin has permission to respond
        const isAdmin = await this.repository.isUserAdmin(adminUserId, request.context.guildId);
        if (!isAdmin) {
            throw new Error(`User ${adminUserId} does not have admin permissions`);
        }

        const now = new Date();
        request.respondedBy = adminUserId;
        request.respondedAt = now;

        switch (response) {
            case 'approve_once':
                request.status = 'approved_once';
                // Grant temporary permission
                await this.grantTemporaryPermission(request, adminUserId, PermissionState.ONCE);
                break;

            case 'approve_forever':
                request.status = 'approved_forever';
                // Grant permanent permission
                await this.grantTemporaryPermission(request, adminUserId, PermissionState.ALLOWED);
                break;

            case 'deny':
                request.status = 'denied';
                // Optionally create explicit denial permission
                await this.grantTemporaryPermission(request, adminUserId, PermissionState.FORBIDDEN);
                break;

            case 'silence':
                request.status = 'denied';
                // Add to silenced requests
                const silenceKey = `${request.requestingUserId}:${request.context.guildId}:${request.permissionRequest.commandPermission}`;
                this.silencedRequests.set(silenceKey, {
                    userId: request.requestingUserId,
                    guildId: request.context.guildId,
                    permissionId: request.permissionRequest.commandPermission,
                    silencedUntil: new Date(Date.now() + this.DEFAULT_SILENCE_HOURS * 60 * 60 * 1000),
                    adminUserId
                });
                break;
        }

        log.info(`Permission request responded to`, 'EphemeralPermissionManager',
            JSON.stringify({
                requestId,
                response,
                adminUserId,
                originalRequester: request.requestingUserId,
                permission: request.permissionRequest.commandPermission
            })
        );
    }

    async cleanupExpiredRequests(): Promise<void> {
        const now = new Date();
        let cleanupCount = 0;

        for (const [id, request] of Object.entries(this.requestStore)) {
            if (request.expiresAt < now && request.status === 'pending') {
                request.status = 'expired';
                delete this.requestStore[id];
                cleanupCount++;
            }
        }

        // Clean up old silenced requests
        let silenceCleanupCount = 0;
        for (const [key, silenced] of this.silencedRequests.entries()) {
            if (silenced.silencedUntil < now) {
                this.silencedRequests.delete(key);
                silenceCleanupCount++;
            }
        }

        if (cleanupCount > 0 || silenceCleanupCount > 0) {
            log.info(`Cleaned up ephemeral permissions`, 'EphemeralPermissionManager',
                JSON.stringify({
                    expiredRequests: cleanupCount,
                    expiredSilences: silenceCleanupCount
                })
            );
        }
    }

    async isRequestSilenced(userId: string, guildId: string, permissionId: string): Promise<boolean> {
        const silenceKey = `${userId}:${guildId}:${permissionId}`;
        const silenced = this.silencedRequests.get(silenceKey);
        
        return silenced ? silenced.silencedUntil > new Date() : false;
    }

    private async grantTemporaryPermission(
        request: EphemeralPermissionGrant,
        adminUserId: string,
        state: PermissionState
    ): Promise<void> {
        const permission: Permission = {
            id: request.permissionRequest.commandPermission,
            state,
            tags: request.permissionRequest.requiredTags || [],
            expiresAt: state === PermissionState.ONCE ? 
                new Date(Date.now() + 60 * 1000) : // 1 minute for 'once'
                undefined, // permanent for 'allowed'/'forbidden'
            createdAt: new Date(),
            updatedAt: new Date(),
            grantedBy: adminUserId,
            reason: `Ephemeral grant for command ${request.commandId}`
        };

        await this.repository.savePermission(
            request.requestingUserId,
            'user',
            permission
        );

        // Grant additional value permissions if any
        if (request.permissionRequest.valuePermissions) {
            for (const valuePermission of request.permissionRequest.valuePermissions) {
                const valuePerm: Permission = {
                    ...permission,
                    id: valuePermission,
                    reason: `Ephemeral grant for command ${request.commandId} (value permission)`
                };
                
                await this.repository.savePermission(
                    request.requestingUserId,
                    'user',
                    valuePerm
                );
            }
        }
    }

    private async notifyAdmins(request: EphemeralPermissionGrant): Promise<void> {
        try {
            const adminUsers = await this.repository.getAdminUsers(request.context.guildId);
            
            log.info(`Notifying admins of permission request`, 'EphemeralPermissionManager',
                JSON.stringify({
                    requestId: request.id,
                    adminUsers,
                    guildId: request.context.guildId
                })
            );

            // TODO: Implement Discord notification system
            // For now just log the notification
            log.info(`Would send ephemeral permission notification`, 'EphemeralPermissionManager',
                JSON.stringify({
                    requestId: request.id,
                    adminUsers,
                    permission: request.permissionRequest.commandPermission,
                    commandId: request.commandId,
                    requestingUser: request.requestingUserId,
                    errorMessage: request.errorMessage
                })
            );
        } catch (error) {
            log.error(`Failed to notify admins of permission request`, 'EphemeralPermissionManager',
                JSON.stringify({
                    requestId: request.id,
                    error: error instanceof Error ? error.message : String(error)
                })
            );
        }
    }
}

// Create singleton instance
import { permissionRepository } from './PermissionRepository.js';
export const ephemeralPermissionManager = new DefaultEphemeralPermissionManager(permissionRepository);