# Generalized Permission System

This document describes the comprehensive permission system implemented for the Content Management Platform, providing hierarchical, lazy-evaluated permissions with interactive granting capabilities.

## Overview

The permission system implements the requirements specified in the feature request:

- **Lazy Evaluation**: Permissions are only created when requested, not pre-populated
- **Hierarchical Checking**: User → Organization → Server → Default permission levels
- **Interactive Granting**: Admin users can approve permission requests through Discord UI
- **Tagged System**: Commands and permissions can be tagged for grouping and filtering
- **Audit Trail**: All permission grants and denials are logged

## Architecture

### Core Components

1. **Domain Layer** (`src/Domain/Permission.ts`)
   - `PermissionState`: Enum defining permission states (undefined, forbidden, once, allowed)
   - `Permission`: Individual permission entry with metadata
   - `PermissionContext`: Context for permission evaluation requests
   - `PermissionEvaluationResult`: Result of permission checking

2. **Repository Layer** (`src/Services/PermissionRepository.ts`)
   - Neo4j-based storage for permissions
   - Hierarchical permission retrieval
   - Admin user management

3. **Evaluation Layer** (`src/Services/PermissionEvaluator.ts`)
   - Implements hierarchical permission checking
   - Lazy evaluation logic
   - Permission caching and optimization

4. **Ephemeral Management** (`src/Services/EphemeralPermissionManager.ts`)
   - Temporary permission request handling
   - Admin notification system
   - Silence functionality to prevent spam

5. **Command Integration** (`src/Common/PermissionMiddleware.ts`)
   - Middleware for existing commands
   - Seamless permission checking
   - User-friendly error messages

## Permission Hierarchy

The system checks permissions in the following order:

1. **User Level**: Permissions directly assigned to a specific user
2. **Organization Level**: Permissions assigned to a Discord guild/organization
3. **Server Level**: Global server-wide permissions
4. **Default Level**: Built-in system defaults

The first explicit permission found (not `undefined`) in this hierarchy is used.

## Permission States

- `undefined`: Permission not explicitly set, continues hierarchy check
- `forbidden`: Permission explicitly denied, stops evaluation
- `once`: Permission granted for single use, then expires
- `allowed`: Permission permanently granted

## Usage Examples

### Adding Permissions to Commands

Use the permission middleware to add permissions to existing commands:

```typescript
import { checkCommandPermissions } from '../Common/PermissionMiddleware.js';

export async function execute(interaction: ChatInputCommandInteraction) {
    // Check permissions first
    const permissionResult = await checkCommandPermissions(interaction, {
        requiredPermissions: ['command.object.user.create'],
        requiredTags: ['user_management'],
        adminOnly: false
    });

    if (!permissionResult.allowed) {
        // Permission denied, response already sent
        return;
    }

    // Permission granted, proceed with command
    // ... command logic
}
```

### Admin Commands

Use the admin interface to manage permissions:

```bash
/admin permissions grant @user permission_id allowed "Reason for granting"
/admin permissions list @user
/admin permissions pending
```

### Permission Templates

Common permission sets can be granted using templates:

```typescript
import { grantPermissionTemplate, PERMISSION_TEMPLATES } from '../Services/PermissionSeeder.js';

// Grant user management permissions
await grantPermissionTemplate(userId, 'USER_MANAGER', adminId, 'New user manager role');
```

## Ephemeral Permission Flow

When a user lacks required permissions:

1. System checks if permission can be requested ephemerally
2. Creates permission request with unique ID
3. Notifies all admin users in the guild
4. Admin can respond via Discord UI buttons:
   - **Approve Once**: Grant permission for single use
   - **Approve Forever**: Grant permanent permission
   - **Deny**: Explicitly deny the request
   - **Silence**: Auto-deny similar requests for 24 hours

## Configuration

### Default Permissions

Server-level defaults are configured in `PermissionSeeder.ts`:

```typescript
const DEFAULT_SERVER_PERMISSIONS = [
    {
        id: 'command.object.user.view',
        state: PermissionState.ALLOWED,
        tags: ['user_management', 'read_only'],
        reason: 'Default server permission - all users can view user information'
    }
];
```

### Permission Templates

Pre-defined permission sets for common roles:

- `USER_MANAGER`: Full user management capabilities
- `CONTENT_MANAGER`: Content creation and editing
- `READ_ONLY`: View-only access to all resources

## Database Schema

Permissions are stored in Neo4j with the following relationships:

```cypher
(:User|Organization|Server)-[:HAS_PERMISSION]->(:Permission)
```

Permission nodes contain:
- `id`: Permission identifier
- `state`: Permission state (allowed/forbidden/once/undefined)
- `tags`: Array of tags for grouping
- `expiresAt`: Expiration timestamp (optional)
- `createdAt`, `updatedAt`: Audit timestamps
- `grantedBy`: User ID who granted the permission
- `reason`: Human-readable reason for the permission

## Testing

Run the permission system test:

```typescript
// This would need to be adapted for actual execution environment
ts-node-esm src/Scripts/TestPermissions.ts
```

## Error Handling

The system provides user-friendly error messages:

- **Permission Denied**: Clear explanation with checked permissions
- **Ephemeral Request Created**: Request ID and instructions for users
- **Admin Notifications**: Rich embeds with request details and action buttons

## Security Considerations

1. **Admin Verification**: All admin actions verify the user has admin privileges
2. **Request Expiry**: Ephemeral requests expire after 30 minutes
3. **Silence Feature**: Prevents spam from repeated requests
4. **Audit Logging**: All permission changes are logged with context

## Migration from Legacy System

The new system maintains compatibility with the existing role-based permissions while adding the new hierarchical system. Commands can gradually migrate to use the new permission middleware.

## Future Enhancements

- Web-based admin interface for permission management
- Advanced permission templates and role-based access control
- Integration with Discord role synchronization
- Permission analytics and usage reporting
- Automated permission suggestions based on user behavior