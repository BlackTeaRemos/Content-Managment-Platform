/**
 * Organization represents a grouping entity that users can belong to.
 * It extends DBObject and primarily uses the base fields.
 */
import type { DBObject } from '../Object/Object.js';

export interface Organization extends DBObject {
    // No additional fields for now – name/friendly_name come from DBObject
}
