/**
 * Domain interfaces and types for the VPI system.
 * This file re-exports all domain interfaces for backward compatibility.
 */

// Object & Versioning Model
export type { ObjectEnvelope, ObjectMeta, TransactionRecord, JsonMutationOp, FieldTagsDelta } from './Object.js';

// Query & Pagination Helpers
export type { CursorToken } from './Query.js';

// Repository Interfaces
export type { ObjectRepository } from './Repository.js';

// Utility Types
export type { EventName } from './Utility.js';

// Event Names constant
export { EVENT_NAMES } from './Utility.js';

// Command Module
export type { CommandModuleMeta, CommandExecutionContext, CommandResult, CommandModule, ExecutionContext } from './Command.js';

// Execution Context Implementation
export { CommandExecutionContextImpl, createExecutionContext } from './ExecutionContext.js';

// Permission System
export type { 
    PermissionState, 
    PermissionLevel, 
    PermissionEntry, 
    PermissionSet, 
    PermissionContext, 
    PermissionResult,
    EphemeralPermissionRequest,
    EphemeralPermissionResponse,
    PermissionRepository,
    PermissionManager
} from './Permission.js';
