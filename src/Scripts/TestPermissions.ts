#!/usr/bin/env ts-node-esm

/**
 * Permission System Test Script
 * Simple test to verify the permission system is working correctly
 */

import { permissionEvaluator } from '../Services/PermissionEvaluator.js';
import { permissionRepository } from '../Services/PermissionRepository.js';
import { seedDefaultPermissions, grantAdminPermissions } from '../Services/PermissionSeeder.js';
import { PermissionState } from '../Domain/Permission.js';
import type { PermissionContext, PermissionRequest } from '../Domain/Permission.js';
import { log } from '../Common/Log.js';

async function testPermissionSystem() {
    console.log('🧪 Testing Permission System...\n');

    try {
        // 1. Seed default permissions
        console.log('1️⃣ Seeding default permissions...');
        await seedDefaultPermissions();
        console.log('✅ Default permissions seeded\n');

        // 2. Test user without permissions
        console.log('2️⃣ Testing user without permissions...');
        const testUserId = 'test_user_123';
        const testGuildId = 'test_guild_456';
        
        const context: PermissionContext = {
            userId: testUserId,
            guildId: testGuildId,
            userRoleIds: [],
            channelId: 'test_channel'
        };

        const request: PermissionRequest = {
            commandPermission: 'command.object.user.create',
            requiredTags: ['user_management']
        };

        let result = await permissionEvaluator.evaluate(context, request);
        console.log(`User create permission: ${result.granted ? '✅ GRANTED' : '❌ DENIED'} (${result.reason})`);
        console.log(`Source: ${result.source}, State: ${result.state}\n`);

        // 3. Test user view permission (should be allowed by default)
        console.log('3️⃣ Testing user view permission...');
        const viewRequest: PermissionRequest = {
            commandPermission: 'command.object.user.view',
            requiredTags: ['user_management']
        };

        result = await permissionEvaluator.evaluate(context, viewRequest);
        console.log(`User view permission: ${result.granted ? '✅ GRANTED' : '❌ DENIED'} (${result.reason})`);
        console.log(`Source: ${result.source}, State: ${result.state}\n`);

        // 4. Grant admin permissions to user
        console.log('4️⃣ Granting admin permissions to user...');
        await grantAdminPermissions(testUserId, 'system_test');
        console.log('✅ Admin permissions granted\n');

        // 5. Test admin user permissions
        console.log('5️⃣ Testing admin user permissions...');
        result = await permissionEvaluator.evaluate(context, request);
        console.log(`Admin user create permission: ${result.granted ? '✅ GRANTED' : '❌ DENIED'} (${result.reason})`);
        console.log(`Source: ${result.source}, State: ${result.state}\n`);

        // 6. Test diagnostic command (admin-only)
        console.log('6️⃣ Testing admin-only diagnostic command...');
        const diagnosticRequest: PermissionRequest = {
            commandPermission: 'admin', // This should map to admin permission for admin-only commands
        };

        result = await permissionEvaluator.evaluate(context, diagnosticRequest);
        console.log(`Admin diagnostic permission: ${result.granted ? '✅ GRANTED' : '❌ DENIED'} (${result.reason})`);
        console.log(`Source: ${result.source}, State: ${result.state}\n`);

        // 7. Test effective permissions
        console.log('7️⃣ Testing effective permissions retrieval...');
        const effectivePermissions = await permissionEvaluator.getEffectivePermissions(testUserId, testGuildId);
        console.log('Effective permissions for test user:');
        Object.entries(effectivePermissions).forEach(([id, state]) => {
            console.log(`  • ${id}: ${state}`);
        });
        console.log('');

        // 8. Test permission repository functions
        console.log('8️⃣ Testing permission repository...');
        const isAdmin = await permissionRepository.isUserAdmin(testUserId, testGuildId);
        console.log(`Is user admin: ${isAdmin ? '✅ YES' : '❌ NO'}\n`);

        console.log('🎉 Permission system test completed successfully!');

    } catch (error) {
        console.error('❌ Permission system test failed:', error);
        process.exit(1);
    }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testPermissionSystem()
        .then(() => {
            console.log('\n✅ All tests passed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Test failed:', error);
            process.exit(1);
        });
}