/**
 * Access Policy Engine interfaces for the VPI system.
 * These interfaces define the access control and policy evaluation mechanisms.
 */

import type { ObjectEnvelope } from './Object.js';

/**
 * Inputs provided to access policy evaluation.
 */
export interface PolicyContext {
    userId: string; // invoking user
    guildId: string; // guild scope
    userRoleIds: string[]; // discord role ids
    providedPassKeys?: string[]; // optional pass keys supplied with command
    requestTags?: string[]; // requested tag filters
    mode?: 'DEFAULT' | 'FORCE_PUBLIC' | 'EPHEMERAL'; // disclosure mode hints
}

/**
 * Result object returned by policy evaluation prior to tag filtering.
 */
export interface PolicyResult {
    allowClosed: boolean; // whether closed segment is visible
    disclosureMode: 'REDACTED' | 'MERGED' | 'EPHEMERAL'; // how to present output
    reasons: string[]; // rationale lines for audit
}

/**
 * Interface every access policy implementation must satisfy.
 */
export interface AccessPolicy {
    /** Evaluate access decision for target object envelope. */
    Evaluate(context: PolicyContext, object: ObjectEnvelope): Promise<PolicyResult>;
}
