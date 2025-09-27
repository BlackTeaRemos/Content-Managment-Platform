/**
 * Generalized Permission System interfaces for the VPI system.
 * These interfaces define structures for lazy permission evaluation and hierarchical access control.
 */

/** Permission states that can be assigned to actions */
export type PermissionState = 'undefined' | 'forbidden' | 'once' | 'allowed';

/** Permission levels in hierarchical order (higher takes precedence) */
export type PermissionLevel = 'server' | 'organization' | 'user' | 'admin';

/** A permission entry defining access for a specific tag/action */
export interface PermissionEntry {
    tag: string; // action/resource tag
    state: PermissionState; // permission state
    grantedBy?: string; // user ID who granted this permission
    grantedAt?: Date; // when permission was granted
    expiresAt?: Date; // optional expiration
    reason?: string; // optional reason for the permission
}

/** Permission set for a specific level (user, organization, server, admin) */
export interface PermissionSet {
    level: PermissionLevel;
    userId?: string; // for user-level permissions
    organizationId?: string; // for organization-level permissions  
    serverId?: string; // for server-level permissions
    permissions: PermissionEntry[]; // list of permission entries
    createdAt: Date;
    updatedAt: Date;
}

/** Context for permission evaluation */
export interface PermissionContext {
    userId: string; // user requesting permission
    guildId: string; // server/guild context
    organizationId?: string; // optional organization context
    requiredTags: string[]; // tags that need permission
    userRoleIds?: string[]; // discord role IDs for role-based checks
    isAdmin?: boolean; // whether user has admin privileges
}

/** Result of permission evaluation */
export interface PermissionResult {
    allowed: boolean; // whether action is permitted
    level: PermissionLevel; // which level granted/denied the permission
    matchedPermissions: PermissionEntry[]; // permissions that matched the request
    missingTags: string[]; // tags that still need permission
    reasons: string[]; // explanatory reasons for the decision
    requiresEphemeralGrant?: boolean; // whether ephemeral grant is needed
}

/** Request for ephemeral permission grant */
export interface EphemeralPermissionRequest {
    requestId: string; // unique request identifier
    userId: string; // user requesting permission
    guildId: string; // server context
    requiredTags: string[]; // tags needing permission
    commandDescription: string; // description of command being executed
    errorReceived: string; // permission error that occurred
    requestedAt: Date;
    expiresAt: Date; // when request expires
}

/** Response to ephemeral permission request */
export interface EphemeralPermissionResponse {
    requestId: string;
    action: 'cancel' | 'approve_once' | 'approve_forever' | 'silence';
    granterId: string; // user who responded
    duration?: number; // for silence action, duration in minutes
    respondedAt: Date;
}

/** Interface for permission storage and retrieval */
export interface PermissionRepository {
    /** Get permission set for a specific level and context */
    getPermissionSet(level: PermissionLevel, context: Partial<PermissionContext>): Promise<PermissionSet | null>;
    
    /** Save/update permission set */
    savePermissionSet(permissionSet: PermissionSet): Promise<void>;
    
    /** Add a new permission entry to existing set */
    addPermission(level: PermissionLevel, context: Partial<PermissionContext>, entry: PermissionEntry): Promise<void>;
    
    /** Remove permission entry */
    removePermission(level: PermissionLevel, context: Partial<PermissionContext>, tag: string): Promise<void>;
    
    /** Store ephemeral permission request */
    storeEphemeralRequest(request: EphemeralPermissionRequest): Promise<void>;
    
    /** Get ephemeral permission request */
    getEphemeralRequest(requestId: string): Promise<EphemeralPermissionRequest | null>;
    
    /** Remove ephemeral permission request */
    removeEphemeralRequest(requestId: string): Promise<void>;
}

/** Interface for the main permission evaluation service */
export interface PermissionManager {
    /** Evaluate permissions for given context and tags */
    evaluate(context: PermissionContext): Promise<PermissionResult>;
    
    /** Grant permission for specific tags */
    grant(level: PermissionLevel, context: Partial<PermissionContext>, tags: string[], state: PermissionState, grantedBy: string, reason?: string): Promise<void>;
    
    /** Revoke permission for specific tags */
    revoke(level: PermissionLevel, context: Partial<PermissionContext>, tags: string[]): Promise<void>;
    
    /** Request ephemeral permission grant */
    requestEphemeralGrant(context: PermissionContext, commandDescription: string, error: string): Promise<string>; // returns requestId
    
    /** Respond to ephemeral permission request */
    respondToEphemeralRequest(requestId: string, response: EphemeralPermissionResponse): Promise<void>;
    
    /** Check if user is admin */
    isAdmin(userId: string, guildId: string): Promise<boolean>;
}