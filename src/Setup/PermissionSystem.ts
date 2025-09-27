/**
 * Global permission system setup and singleton instances.
 * This module provides configured instances of the permission system components.
 */

import { PermissionService } from '../Services/PermissionService.js';
import { InMemoryPermissionRepository } from '../Repository/InMemoryPermissionRepository.js';
import { CommandRegistry } from '../Services/CommandRegistry.js';

// Create singleton instances
export const permissionRepository = new InMemoryPermissionRepository();
export const permissionService = new PermissionService(permissionRepository);

// Create command registry with permission system integration
export const commandRegistry = new CommandRegistry({
    permissionManager: permissionService
});

// For development/testing, set up some initial admin permissions
// In production, this would be done through proper admin setup
export async function initializePermissionSystem(adminUserId?: string, guildId?: string) {
    if (adminUserId && guildId) {
        try {
            // Grant admin permissions
            await permissionService.grant(
                'admin', 
                { userId: adminUserId, guildId }, 
                ['admin.*', 'permission.*'], 
                'allowed',
                'system',
                'Initial admin setup'
            );
            
            console.log(`Initialized admin permissions for user ${adminUserId} in guild ${guildId}`);
        } catch (error) {
            console.error('Failed to initialize admin permissions:', error);
        }
    }
}