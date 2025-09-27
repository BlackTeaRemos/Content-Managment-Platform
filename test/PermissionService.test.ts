import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionService } from '../src/Services/PermissionService.js';
import { InMemoryPermissionRepository } from '../src/Repository/InMemoryPermissionRepository.js';
import { PermissionContext } from '../src/Domain/Permission.js';

describe('PermissionService', () => {
    let repository: InMemoryPermissionRepository;
    let service: PermissionService;

    beforeEach(async () => {
        repository = new InMemoryPermissionRepository();
        service = new PermissionService(repository);
        await repository.clear(); // Ensure clean state
    });

    describe('permission evaluation', () => {
        it('should deny access when no permissions exist', async () => {
            const context: PermissionContext = {
                userId: 'user1',
                guildId: 'guild1',
                requiredTags: ['test.read']
            };

            const result = await service.evaluate(context);

            expect(result.allowed).toBe(false);
            expect(result.missingTags).toEqual(['test.read']);
            expect(result.requiresEphemeralGrant).toBe(true);
        });

        it('should allow access when user has required permissions', async () => {
            const context: PermissionContext = {
                userId: 'user1',
                guildId: 'guild1',
                requiredTags: ['test.read']
            };

            // Grant permission
            await service.grant('user', { userId: 'user1', guildId: 'guild1' }, ['test.read'], 'allowed', 'admin');

            const result = await service.evaluate(context);

            expect(result.allowed).toBe(true);
            expect(result.level).toBe('user');
            expect(result.missingTags).toHaveLength(0);
        });

        it('should deny access when permission is forbidden', async () => {
            const context: PermissionContext = {
                userId: 'user1',
                guildId: 'guild1',
                requiredTags: ['test.write']
            };

            // Explicitly forbid permission
            await service.grant('user', { userId: 'user1', guildId: 'guild1' }, ['test.write'], 'forbidden', 'admin');

            const result = await service.evaluate(context);

            expect(result.allowed).toBe(false);
            expect(result.reasons).toContain("Permission denied for tag 'test.write' by user level policy");
        });

        it('should consume "once" permission after use', async () => {
            const context: PermissionContext = {
                userId: 'user1',
                guildId: 'guild1',
                requiredTags: ['test.once']
            };

            // Grant one-time permission
            await service.grant('user', { userId: 'user1', guildId: 'guild1' }, ['test.once'], 'once', 'admin');

            // First evaluation should succeed
            const result1 = await service.evaluate(context);
            expect(result1.allowed).toBe(true);

            // Second evaluation should fail (permission was consumed)
            const result2 = await service.evaluate(context);
            expect(result2.allowed).toBe(false);
            expect(result2.missingTags).toContain('test.once');
        });

        it('should respect permission hierarchy (user > organization > server)', async () => {
            const context: PermissionContext = {
                userId: 'user1',
                guildId: 'guild1',
                organizationId: 'org1',
                requiredTags: ['test.hierarchy']
            };

            // Grant at server level
            await service.grant('server', { guildId: 'guild1' }, ['test.hierarchy'], 'forbidden', 'admin');
            
            // Grant at organization level (should override server)
            await service.grant('organization', { organizationId: 'org1', guildId: 'guild1' }, ['test.hierarchy'], 'allowed', 'admin');

            const result = await service.evaluate(context);

            expect(result.allowed).toBe(true);
            expect(result.level).toBe('organization');
        });

        it('should handle admin permissions correctly', async () => {
            const context: PermissionContext = {
                userId: 'admin1',
                guildId: 'guild1',
                requiredTags: ['anything.at.all'],
                isAdmin: true
            };

            const result = await service.evaluate(context);

            expect(result.allowed).toBe(true);
            expect(result.level).toBe('admin');
            expect(result.reasons).toContain('Admin privileges granted');
        });
    });

    describe('permission management', () => {
        it('should grant permissions correctly', async () => {
            await service.grant('user', { userId: 'user1', guildId: 'guild1' }, ['test.new'], 'allowed', 'admin', 'Test permission');

            const permissionSet = await repository.getPermissionSet('user', { userId: 'user1', guildId: 'guild1' });
            expect(permissionSet).toBeDefined();
            expect(permissionSet!.permissions).toHaveLength(1);
            expect(permissionSet!.permissions[0].tag).toBe('test.new');
            expect(permissionSet!.permissions[0].state).toBe('allowed');
            expect(permissionSet!.permissions[0].reason).toBe('Test permission');
        });

        it('should revoke permissions correctly', async () => {
            // Grant first
            await service.grant('user', { userId: 'user1', guildId: 'guild1' }, ['test.revoke'], 'allowed', 'admin');

            // Verify it exists
            let permissionSet = await repository.getPermissionSet('user', { userId: 'user1', guildId: 'guild1' });
            expect(permissionSet!.permissions).toHaveLength(1);

            // Revoke
            await service.revoke('user', { userId: 'user1', guildId: 'guild1' }, ['test.revoke']);

            // Verify it's gone
            permissionSet = await repository.getPermissionSet('user', { userId: 'user1', guildId: 'guild1' });
            expect(permissionSet!.permissions).toHaveLength(0);
        });

        it('should replace existing permission when granting same tag', async () => {
            // Grant allowed
            await service.grant('user', { userId: 'user1', guildId: 'guild1' }, ['test.replace'], 'allowed', 'admin');

            // Grant forbidden (should replace)
            await service.grant('user', { userId: 'user1', guildId: 'guild1' }, ['test.replace'], 'forbidden', 'admin');

            const permissionSet = await repository.getPermissionSet('user', { userId: 'user1', guildId: 'guild1' });
            expect(permissionSet!.permissions).toHaveLength(1);
            expect(permissionSet!.permissions[0].state).toBe('forbidden');
        });
    });

    describe('ephemeral permission requests', () => {
        it('should create and retrieve ephemeral requests', async () => {
            const context: PermissionContext = {
                userId: 'user1',
                guildId: 'guild1',
                requiredTags: ['test.ephemeral']
            };

            const requestId = await service.requestEphemeralGrant(context, 'Test command', 'Permission denied');

            const request = await repository.getEphemeralRequest(requestId);
            expect(request).toBeDefined();
            expect(request!.userId).toBe('user1');
            expect(request!.requiredTags).toEqual(['test.ephemeral']);
        });

        it('should handle ephemeral approval correctly', async () => {
            const context: PermissionContext = {
                userId: 'user1',
                guildId: 'guild1',
                requiredTags: ['test.approve']
            };

            const requestId = await service.requestEphemeralGrant(context, 'Test command', 'Permission denied');

            // Approve forever
            await service.respondToEphemeralRequest(requestId, {
                requestId,
                action: 'approve_forever',
                granterId: 'admin1',
                respondedAt: new Date()
            });

            // Check that permission was granted
            const result = await service.evaluate(context);
            expect(result.allowed).toBe(true);

            // Check that request was removed
            const request = await repository.getEphemeralRequest(requestId);
            expect(request).toBeNull();
        });
    });
});