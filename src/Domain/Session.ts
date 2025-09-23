/**
 * Edit Sessions & Undo interfaces for the VPI system.
 * These interfaces define structures for managing edit sessions and undo operations.
 */

import type { JsonMutationOp, FieldTagsDelta } from './Object.js';

/** Active edit session state held per user/object pair. */
export interface EditSession {
    sessionId: string; // unique session id
    objectId: string; // target object id
    guildId: string; // guild scope
    userId: string; // editing user
    startedAt: number; // epoch ms
    expiresAt: number; // epoch ms timeout
    lastActivityAt: number; // updated each command
    undoStack: UndoStackEntry[]; // recent transactions authored this session
}

/**
 * Undo stack entry capturing inverse operations required to revert a transaction.
 */
export interface UndoStackEntry {
    transactionId: string; // original tx id
    inverseOps: JsonMutationOp[]; // operations to revert state
    inverseFieldTagsDelta?: FieldTagsDelta; // reversal for field tags delta
}
