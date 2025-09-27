# Generalized Permission System

This document describes the generalized permission system implemented for the VPI platform. The system provides lazy evaluation, hierarchical permission checking, and ephemeral permission granting capabilities.

## Overview

The permission system is designed around the following core principles:

1. **Lazy Evaluation**: Permissions are only evaluated when needed, not pre-computed
2. **Hierarchical Checking**: Permissions are checked in order of precedence (Admin > User > Organization > Server)
3. **Tag-Based Control**: Actions are controlled by permission tags rather than simple role-based access
4. **Ephemeral Grants**: Users can request temporary permissions that can be approved by admins
5. **Audit Logging**: All permission operations are logged for security auditing

## Permission States

Each permission can have one of four states:

- **`undefined`**: No explicit permission (inherits from lower levels)
- **`forbidden`**: Explicitly denied (takes precedence over all other levels)
- **`once`**: Allowed for one-time use (automatically removed after use)
- **`allowed`**: Permanently allowed

## Permission Levels (Hierarchical)

The system supports four permission levels in order of precedence:

1. **`admin`**: Highest precedence - bypasses all other checks
2. **`user`**: User-specific permissions
3. **`organization`**: Organization-wide permissions
4. **`server`**: Server/guild-wide default permissions

Higher levels always take precedence over lower levels.

## Architecture

### Core Interfaces

#### `PermissionContext`
Defines the context for permission evaluation:
```typescript
interface PermissionContext {
    userId: string;        // User requesting permission
    guildId: string;       // Server/guild context  
    organizationId?: string; // Optional organization context
    requiredTags: string[]; // Tags that need permission
    userRoleIds?: string[]; // Discord role IDs
    isAdmin?: boolean;     // Admin flag
}
```

#### `PermissionResult`
Result of permission evaluation:
```typescript
interface PermissionResult {
    allowed: boolean;           // Whether action is permitted
    level: PermissionLevel;     // Which level granted/denied permission
    matchedPermissions: PermissionEntry[]; // Matched permission entries
    missingTags: string[];      // Tags still needing permission
    reasons: string[];          // Explanation of the decision
    requiresEphemeralGrant?: boolean; // Whether ephemeral grant is needed
}
```

### Core Services

#### `PermissionService`
Main service for permission evaluation and management:

```typescript
// Evaluate permissions
const result = await permissionService.evaluate({
    userId: 'user123',
    guildId: 'guild456', 
    requiredTags: ['example.read', 'example.write']
});

// Grant permissions
await permissionService.grant(
    'user', 
    { userId: 'user123', guildId: 'guild456' },
    ['example.read'], 
    'allowed',
    'admin789',
    'User needs read access'
);

// Revoke permissions
await permissionService.revoke(
    'user',
    { userId: 'user123', guildId: 'guild456' },
    ['example.read']
);
```

#### `PermissionRepository`
Interface for permission storage. Current implementation includes:
- `InMemoryPermissionRepository`: In-memory storage for development/testing

## Command Integration

### Adding Permissions to Commands

Commands can specify required permission tags in their metadata:

```typescript
export const meta: CommandModuleMeta = {
    id: 'example-command',
    description: 'Example command with permissions',
    permissions: {
        requiredTags: ['example.read', 'example.execute'],
        allowDM: false // Legacy support
    },
    tags: ['example', 'demo']
};
```

### Automatic Permission Checking

The `CommandRegistry` automatically checks permissions before executing commands. If permission is denied:

1. The user receives a permission denied message
2. If the system supports ephemeral grants, a request is automatically created
3. Users with permission management rights are notified

## Admin Commands

The system includes comprehensive admin commands under `/admin permissions`:

### Grant Permissions
```
/admin permissions grant user:@user tags:example.read,example.write state:allowed level:user reason:"Needs access"
```

### Revoke Permissions  
```
/admin permissions revoke user:@user tags:example.read level:user
```

### List User Permissions
```
/admin permissions list user:@user
```

### Check Permissions
```
/admin permissions check user:@user tags:example.read,example.write
```

## Ephemeral Permission System

When a user tries to execute a command without required permissions, the system can automatically create an ephemeral permission request:

1. **Request Creation**: System creates a temporary permission request
2. **Notification**: Users with permission management rights receive notifications
3. **Response Options**:
   - `cancel`: Deny the request
   - `approve_once`: Grant one-time permission
   - `approve_forever`: Grant permanent permission
   - `silence`: Auto-cancel future requests for a duration

## Permission Flow Example

Here's how the system evaluates a permission request:

```
User requests: /example read
Required tags: ['example.read', 'example.execute']

1. Check if user is admin
   - If yes → ALLOW (bypass all other checks)
   
2. Check user-level permissions
   - example.read: 'allowed' ✓
   - example.execute: not found
   
3. Check organization-level permissions  
   - example.execute: 'forbidden' ✗
   
4. Result: DENY (forbidden takes precedence)
   Reason: "Permission denied for tag 'example.execute' by organization level policy"
```

## Events and Logging

The permission system emits events for audit logging:

- `permission.granted`: When permissions are granted
- `permission.revoked`: When permissions are revoked  
- `permission.ephemeral_request`: When ephemeral requests are created
- `permission.ephemeral_response`: When ephemeral requests are responded to

All permission operations include detailed logging with:
- User IDs involved
- Permission tags affected
- Granter information
- Reasons for changes
- Timestamps

## Security Considerations

1. **Admin Bypass**: Admin users bypass all permission checks - ensure admin assignment is carefully controlled
2. **Permission Precedence**: Higher levels override lower levels - be careful with organization/server-wide forbidden permissions
3. **Ephemeral Requests**: Consider rate limiting to prevent spam
4. **Audit Trails**: All permission changes are logged - monitor these logs for security
5. **Tag Naming**: Use consistent, descriptive tag names to avoid confusion

## Migration from Legacy System

The system maintains backward compatibility with the existing role-based permission system:

```typescript
permissions: {
    requiredRoles: ['ADMIN'], // Legacy - still works
    requiredTags: ['admin.manage'] // New system
}
```

Commands are checked for both legacy roles and new tags. The new system takes precedence when both are present.

## Development and Testing

The permission system includes comprehensive unit tests covering:

- Permission evaluation logic
- Hierarchical permission checking
- Permission state transitions
- Ephemeral request handling
- Admin bypass functionality

Run tests with:
```bash
npm test
```

## Future Enhancements

Planned improvements include:

1. **Persistent Storage**: Replace in-memory repository with database storage
2. **Permission Templates**: Pre-defined permission sets for common roles
3. **Time-based Permissions**: Permissions that expire at specific times
4. **Advanced Audit UI**: Web interface for viewing permission audit logs
5. **Permission Analytics**: Usage tracking and recommendations
6. **Integration APIs**: External systems integration for permission management

## Troubleshooting

### Common Issues

**Permission Denied Despite Admin Role**
- Check if user is properly marked as admin in the system
- Verify admin permissions are granted at the correct level

**Ephemeral Requests Not Working**
- Ensure event handlers are properly registered
- Check that users with permission management rights exist

**Permission Changes Not Taking Effect**
- In-memory repository resets on restart - use persistent storage for production
- Check permission hierarchy - higher levels may be overriding changes

### Debug Commands

Use the admin commands to debug permission issues:

```bash
# Check what permissions a user has
/admin permissions list user:@problematic_user

# Test specific permission tags
/admin permissions check user:@user tags:specific.tag

# View system logs
# Check application logs for permission evaluation details
```