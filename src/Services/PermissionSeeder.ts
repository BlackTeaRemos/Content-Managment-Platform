/**
 * Permission Seeder
 * Sets up default permissions for the system
 */

import { PermissionState } from '../Domain/Permission.js';
import { permissionRepository } from '../Services/PermissionRepository.js';
import { log } from '../Common/Log.js';

/** Default server-level permissions */
const DEFAULT_SERVER_PERMISSIONS = [
    {
        id: 'command.object.user.view',
        state: PermissionState.ALLOWED,
        tags: ['user_management', 'read_only'],
        reason: 'Default server permission - all users can view user information'
    },
    {
        id: 'command.diagnostic.tree',
        state: PermissionState.FORBIDDEN,
        tags: ['admin', 'diagnostic'],
        reason: 'Default server permission - diagnostic commands require admin privileges'
    }
];

/** Default organization-level permissions */
const DEFAULT_ORG_PERMISSIONS: Array<{
    id: string;
    state: PermissionState;
    tags: string[];
    reason: string;
}> = [
    // Organizations can override server defaults here
];

/**
 * Initialize default permissions for the server
 */
export async function seedDefaultPermissions(): Promise<void> {
    try {
        log.info('Seeding default permissions', 'PermissionSeeder');

        // Set up server-level permissions
        for (const permConfig of DEFAULT_SERVER_PERMISSIONS) {
            const permission = {
                id: permConfig.id,
                state: permConfig.state,
                tags: permConfig.tags,
                createdAt: new Date(),
                updatedAt: new Date(),
                reason: permConfig.reason
            };

            await permissionRepository.savePermission('server', 'server', permission);
            
            log.info(`Seeded server permission: ${permConfig.id}`, 'PermissionSeeder');
        }

        // Set up default organization permissions if any
        for (const permConfig of DEFAULT_ORG_PERMISSIONS) {
            // This would be organization-specific seeding
            // For now, we'll skip this as we don't have a specific organization context
        }

        log.info('Default permission seeding completed', 'PermissionSeeder');
    } catch (error) {
        log.error('Failed to seed default permissions', 'PermissionSeeder', String(error));
        throw error;
    }
}

/**
 * Create admin permissions for a specific user
 */
export async function grantAdminPermissions(userId: string, grantedBy?: string): Promise<void> {
    try {
        const adminPermission = {
            id: 'admin',
            state: PermissionState.ALLOWED,
            tags: ['admin'],
            createdAt: new Date(),
            updatedAt: new Date(),
            grantedBy,
            reason: 'Admin privileges granted'
        };

        await permissionRepository.savePermission(userId, 'user', adminPermission);
        
        log.info(`Granted admin permissions to user: ${userId}`, 'PermissionSeeder');
    } catch (error) {
        log.error(`Failed to grant admin permissions to user: ${userId}`, 'PermissionSeeder', String(error));
        throw error;
    }
}

/**
 * Set up permissions for a new organization
 */
export async function initializeOrganizationPermissions(guildId: string): Promise<void> {
    try {
        // Default organization permissions
        const orgPermissions = [
            {
                id: 'command.object.user.create',
                state: PermissionState.FORBIDDEN, // By default, only admins can create users
                tags: ['user_management'],
                reason: 'Default organization permission - user creation requires elevation'
            }
        ];

        for (const permConfig of orgPermissions) {
            const permission = {
                id: permConfig.id,
                state: permConfig.state,
                tags: permConfig.tags,
                createdAt: new Date(),
                updatedAt: new Date(),
                reason: permConfig.reason
            };

            await permissionRepository.savePermission(guildId, 'organization', permission);
        }

        log.info(`Initialized organization permissions for: ${guildId}`, 'PermissionSeeder');
    } catch (error) {
        log.error(`Failed to initialize organization permissions for: ${guildId}`, 'PermissionSeeder', String(error));
        throw error;
    }
}

/**
 * Common permission sets that can be granted to users
 */
export const PERMISSION_TEMPLATES = {
    USER_MANAGER: [
        'command.object.user.view',
        'command.object.user.create',
        'command.object.user.edit',
        'command.object.user.delete'
    ],
    CONTENT_MANAGER: [
        'command.object.building.view',
        'command.object.building.create',
        'command.object.building.edit',
        'command.object.description.view',
        'command.object.description.create',
        'command.object.description.edit'
    ],
    READ_ONLY: [
        'command.object.user.view',
        'command.object.building.view',
        'command.object.description.view',
        'command.object.organization.view'
    ]
};

/**
 * Grant a permission template to a user
 */
export async function grantPermissionTemplate(
    userId: string, 
    template: keyof typeof PERMISSION_TEMPLATES,
    grantedBy?: string,
    reason?: string
): Promise<void> {
    const permissions = PERMISSION_TEMPLATES[template];
    
    for (const permId of permissions) {
        const permission = {
            id: permId,
            state: PermissionState.ALLOWED,
            tags: ['template', template.toLowerCase()],
            createdAt: new Date(),
            updatedAt: new Date(),
            grantedBy,
            reason: reason || `Granted via ${template} template`
        };

        await permissionRepository.savePermission(userId, 'user', permission);
    }

    log.info(`Granted ${template} template permissions to user: ${userId}`, 'PermissionSeeder');
}