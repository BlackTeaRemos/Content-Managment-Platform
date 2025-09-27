/**
 * Generalized Permission System interfaces for the VPI system.
 * Implements lazy-evaluated, hierarchical permissions with interactive granting.
 */

/** Permission states as defined in the requirements */
export enum PermissionState {
    /** Permission not yet evaluated or defined */
    UNDEFINED = 'undefined',
    /** Permission explicitly denied */
    FORBIDDEN = 'forbidden', 
    /** Permission granted for single execution only */
    ONCE = 'once',
    /** Permission granted permanently */
    ALLOWED = 'allowed'
}

/** Individual permission entry */
export interface Permission {
    /** Permission identifier (e.g., 'command.object.user.create') */
    id: string;
    /** Current state of the permission */
    state: PermissionState;
    /** Tags associated with this permission for grouping and filtering */
    tags?: string[];
    /** Expiration timestamp for temporary permissions (optional) */
    expiresAt?: Date;
    /** Audit metadata */
    createdAt: Date;
    updatedAt: Date;
    grantedBy?: string; // user ID who granted the permission
    reason?: string; // reason for granting/denying
}

/** Permission context for evaluation requests */
export interface PermissionContext {
    /** User requesting the permission */
    userId: string;
    /** Guild/organization scope */
    guildId: string;
    /** User's Discord roles */
    userRoleIds: string[];
    /** Channel where request originated */
    channelId?: string;
    /** Additional context for permission evaluation */
    metadata?: Record<string, any>;
}

/** Request for permission evaluation */
export interface PermissionRequest {
    /** Main command permission required */
    commandPermission: string;
    /** Additional permissions for argument values */
    valuePermissions?: string[];
    /** Tags required for this operation */
    requiredTags?: string[];
    /** Optional reason for the permission request */
    reason?: string;
}

/** Result of permission evaluation */
export interface PermissionEvaluationResult {
    /** Whether permission is granted */
    granted: boolean;
    /** Final permission state */
    state: PermissionState;
    /** Which level granted/denied the permission (user, org, server, default) */
    source: 'user' | 'organization' | 'server' | 'default' | 'admin_override';
    /** Detailed permissions that were checked */
    checkedPermissions: Array<{
        id: string;
        state: PermissionState;
        required: boolean;
    }>;
    /** Reason for the decision */
    reason?: string;
    /** Whether this should trigger an ephemeral permission request */
    requiresEphemeralGrant?: boolean;
}

/** Ephemeral permission grant request sent to administrators */
export interface EphemeralPermissionGrant {
    /** Unique ID for this grant request */
    id: string;
    /** User requesting the permission */
    requestingUserId: string;
    /** Permission being requested */
    permissionRequest: PermissionRequest;
    /** Context of the original request */
    context: PermissionContext;
    /** Command that was being executed */
    commandId: string;
    /** Error message received when permission was denied */
    errorMessage: string;
    /** Timestamp when request was created */
    createdAt: Date;
    /** Expiration time for this ephemeral request */
    expiresAt: Date;
    /** Status of this grant request */
    status: 'pending' | 'approved_once' | 'approved_forever' | 'denied' | 'expired';
    /** Administrator who responded (if any) */
    respondedBy?: string;
    /** Response timestamp */
    respondedAt?: Date;
}

/** Permission storage container for a user/organization/server */
export interface PermissionSet {
    /** Scope ID (userId, guildId, or 'server' for global) */
    scopeId: string;
    /** Type of scope */
    scopeType: 'user' | 'organization' | 'server';
    /** Map of permission ID to Permission */
    permissions: Record<string, Permission>;
    /** When this permission set was last updated */
    lastUpdated: Date;
    /** Version for optimistic concurrency */
    version: number;
}

/** Interface for permission repository operations */
export interface PermissionRepository {
    /** Get permission set for a specific scope */
    getPermissionSet(scopeId: string, scopeType: 'user' | 'organization' | 'server'): Promise<PermissionSet | null>;
    
    /** Save permission set */
    savePermissionSet(permissionSet: PermissionSet): Promise<void>;
    
    /** Get specific permission by ID and scope */
    getPermission(scopeId: string, scopeType: 'user' | 'organization' | 'server', permissionId: string): Promise<Permission | null>;
    
    /** Save/update specific permission */
    savePermission(scopeId: string, scopeType: 'user' | 'organization' | 'server', permission: Permission): Promise<void>;
    
    /** Delete permission */
    deletePermission(scopeId: string, scopeType: 'user' | 'organization' | 'server', permissionId: string): Promise<void>;
    
    /** Check if user is admin (can grant permissions) */
    isUserAdmin(userId: string, guildId: string): Promise<boolean>;
    
    /** Get list of admin users for ephemeral permission requests */
    getAdminUsers(guildId: string): Promise<string[]>;
}

/** Interface for permission evaluation service */
export interface PermissionEvaluator {
    /** Evaluate permission request using hierarchical checking */
    evaluate(context: PermissionContext, request: PermissionRequest): Promise<PermissionEvaluationResult>;
    
    /** Check if user can execute a specific command */
    canExecuteCommand(context: PermissionContext, commandId: string, commandTags?: string[]): Promise<PermissionEvaluationResult>;
    
    /** Get effective permissions for a user (merged hierarchy) */
    getEffectivePermissions(userId: string, guildId: string): Promise<Record<string, PermissionState>>;
}

/** Interface for managing ephemeral permission grants */
export interface EphemeralPermissionManager {
    /** Create new ephemeral permission request */
    createPermissionRequest(
        context: PermissionContext,
        request: PermissionRequest,
        commandId: string,
        errorMessage: string
    ): Promise<EphemeralPermissionGrant>;
    
    /** Get pending permission requests for admins */
    getPendingRequests(guildId: string): Promise<EphemeralPermissionGrant[]>;
    
    /** Respond to permission request */
    respondToRequest(
        requestId: string, 
        adminUserId: string,
        response: 'approve_once' | 'approve_forever' | 'deny' | 'silence'
    ): Promise<void>;
    
    /** Clean up expired requests */
    cleanupExpiredRequests(): Promise<void>;
    
    /** Check if request should be silenced (admin chose silence) */
    isRequestSilenced(userId: string, guildId: string, permissionId: string): Promise<boolean>;
}