/**
 * Query & Pagination Helpers interfaces for the VPI system.
 * These interfaces define structures for pagination and query operations.
 */

/** Cursor token structure for paginated listings. */
export interface CursorToken {
    offset: number; // numeric offset
    pageSize: number; // size requested
    hash?: string; // index hash snapshot when issued
}
