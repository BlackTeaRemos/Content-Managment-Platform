/**
 * Permission Evaluation Service
 * Implements the hierarchical permission checking logic with lazy evaluation.
 */

import type {
    PermissionEvaluator,
    PermissionContext,
    PermissionRequest,
    PermissionEvaluationResult,
    PermissionRepository,
    Permission
} from '../Domain/Permission.js';
import { PermissionState } from '../Domain/Permission.js';
import { log } from '../Common/Log.js';

export class HierarchicalPermissionEvaluator implements PermissionEvaluator {
    constructor(private repository: PermissionRepository) {}

    async evaluate(context: PermissionContext, request: PermissionRequest): Promise<PermissionEvaluationResult> {
        log.info(`Evaluating permission request`, 'PermissionEvaluator',
            JSON.stringify({
                userId: context.userId,
                guildId: context.guildId,
                commandPermission: request.commandPermission,
                valuePermissions: request.valuePermissions,
                requiredTags: request.requiredTags
            })
        );

        // Collect all permissions to check
        const permissionsToCheck = [request.commandPermission];
        if (request.valuePermissions) {
            permissionsToCheck.push(...request.valuePermissions);
        }

        const checkedPermissions = [];
        let anyRequired = false;
        let allGranted = true;
        let finalSource: PermissionEvaluationResult['source'] = 'default';

        // Check if user is admin - admins bypass all permission checks
        const isAdmin = await this.repository.isUserAdmin(context.userId, context.guildId);
        if (isAdmin) {
            return {
                granted: true,
                state: PermissionState.ALLOWED,
                source: 'admin_override',
                checkedPermissions: permissionsToCheck.map(id => ({
                    id,
                    state: PermissionState.ALLOWED,
                    required: true
                })),
                reason: 'User has admin privileges'
            };
        }

        // Check each permission using hierarchy
        for (const permissionId of permissionsToCheck) {
            const result = await this.evaluateHierarchicalPermission(
                context,
                permissionId,
                request.requiredTags || []
            );

            checkedPermissions.push({
                id: permissionId,
                state: result.state,
                required: true
            });

            if (result.state === PermissionState.FORBIDDEN) {
                // If any permission is explicitly forbidden, deny immediately
                return {
                    granted: false,
                    state: PermissionState.FORBIDDEN,
                    source: result.source,
                    checkedPermissions,
                    reason: `Permission ${permissionId} is forbidden`
                };
            }

            if (result.state === PermissionState.ALLOWED || result.state === PermissionState.ONCE) {
                anyRequired = true;
                // Update final source to the most specific level that granted permission
                if (this.getSourcePriority(result.source) > this.getSourcePriority(finalSource)) {
                    finalSource = result.source;
                }
            } else if (result.state === PermissionState.UNDEFINED) {
                allGranted = false;
            }
        }

        // Determine final result
        if (anyRequired && allGranted) {
            // All permissions are either explicitly allowed/once or undefined (treated as allowed in hierarchy)
            return {
                granted: true,
                state: PermissionState.ALLOWED,
                source: finalSource,
                checkedPermissions,
                reason: 'All required permissions granted'
            };
        } else if (anyRequired) {
            // Some permissions granted, some undefined - may need ephemeral grant
            return {
                granted: false,
                state: PermissionState.UNDEFINED,
                source: 'default',
                checkedPermissions,
                reason: 'Some permissions are undefined',
                requiresEphemeralGrant: true
            };
        } else {
            // No permissions found in hierarchy - requires ephemeral grant
            return {
                granted: false,
                state: PermissionState.UNDEFINED,
                source: 'default',
                checkedPermissions,
                reason: 'No permissions defined in hierarchy',
                requiresEphemeralGrant: true
            };
        }
    }

    async canExecuteCommand(context: PermissionContext, commandId: string, commandTags?: string[]): Promise<PermissionEvaluationResult> {
        const request: PermissionRequest = {
            commandPermission: `command.${commandId}`,
            requiredTags: commandTags
        };

        return this.evaluate(context, request);
    }

    async getEffectivePermissions(userId: string, guildId: string): Promise<Record<string, PermissionState>> {
        const effective: Record<string, PermissionState> = {};

        // Get permissions from all levels in hierarchy
        const userPerms = await this.repository.getPermissionSet(userId, 'user');
        const orgPerms = await this.repository.getPermissionSet(guildId, 'organization');
        const serverPerms = await this.repository.getPermissionSet('server', 'server');

        // Apply in reverse priority order (server -> org -> user)
        if (serverPerms) {
            for (const [id, perm] of Object.entries(serverPerms.permissions)) {
                if (this.isPermissionValid(perm)) {
                    effective[id] = perm.state;
                }
            }
        }

        if (orgPerms) {
            for (const [id, perm] of Object.entries(orgPerms.permissions)) {
                if (this.isPermissionValid(perm)) {
                    effective[id] = perm.state;
                }
            }
        }

        if (userPerms) {
            for (const [id, perm] of Object.entries(userPerms.permissions)) {
                if (this.isPermissionValid(perm)) {
                    effective[id] = perm.state;
                }
            }
        }

        return effective;
    }

    private async evaluateHierarchicalPermission(
        context: PermissionContext,
        permissionId: string,
        requiredTags: string[]
    ): Promise<{ state: PermissionState; source: PermissionEvaluationResult['source'] }> {
        
        // 1. Check user-level permissions
        const userPermission = await this.repository.getPermission(context.userId, 'user', permissionId);
        if (userPermission && this.isPermissionValid(userPermission) && this.hasRequiredTags(userPermission, requiredTags)) {
            if (userPermission.state !== PermissionState.UNDEFINED) {
                return { state: userPermission.state, source: 'user' };
            }
        }

        // 2. Check organization-level permissions  
        const orgPermission = await this.repository.getPermission(context.guildId, 'organization', permissionId);
        if (orgPermission && this.isPermissionValid(orgPermission) && this.hasRequiredTags(orgPermission, requiredTags)) {
            if (orgPermission.state !== PermissionState.UNDEFINED) {
                return { state: orgPermission.state, source: 'organization' };
            }
        }

        // 3. Check server-level permissions
        const serverPermission = await this.repository.getPermission('server', 'server', permissionId);
        if (serverPermission && this.isPermissionValid(serverPermission) && this.hasRequiredTags(serverPermission, requiredTags)) {
            if (serverPermission.state !== PermissionState.UNDEFINED) {
                return { state: serverPermission.state, source: 'server' };
            }
        }

        // 4. Default: permission is undefined
        return { state: PermissionState.UNDEFINED, source: 'default' };
    }

    private isPermissionValid(permission: Permission): boolean {
        // Check if permission has expired
        if (permission.expiresAt && permission.expiresAt < new Date()) {
            return false;
        }
        return true;
    }

    private hasRequiredTags(permission: Permission, requiredTags: string[]): boolean {
        if (!requiredTags.length) {
            return true;
        }

        const permTags = permission.tags || [];
        return requiredTags.every(tag => permTags.includes(tag));
    }

    private getSourcePriority(source: PermissionEvaluationResult['source']): number {
        switch (source) {
            case 'admin_override': return 100;
            case 'user': return 4;
            case 'organization': return 3;
            case 'server': return 2;
            case 'default': return 1;
            default: return 0;
        }
    }
}

// Create default instance
import { permissionRepository } from './PermissionRepository.js';
export const permissionEvaluator = new HierarchicalPermissionEvaluator(permissionRepository);