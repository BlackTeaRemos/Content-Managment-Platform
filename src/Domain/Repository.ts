/**
 * Repository Interfaces for the VPI system.
 * These interfaces define contracts for object repositories.
 */

import type { ObjectEnvelope, TransactionRecord } from './Object.js';
import type { CursorToken } from './Query.js';

/** Abstraction for object repository operations. */
export interface ObjectRepository {
    Create(envelope: ObjectEnvelope, initialTx: TransactionRecord): Promise<ObjectEnvelope>;
    Get(id: string): Promise<ObjectEnvelope | null>;
    Update(id: string, tx: TransactionRecord): Promise<ObjectEnvelope>; // NOTE: future: return OperationOutcome
    List(filter?: {
        objectType?: string;
        tags?: string[];
        cursor?: CursorToken;
    }): Promise<{ objects: ObjectEnvelope[]; nextCursor?: CursorToken }>;
    History(id: string, fromVersion?: number, toVersion?: number): Promise<TransactionRecord[]>;
}
