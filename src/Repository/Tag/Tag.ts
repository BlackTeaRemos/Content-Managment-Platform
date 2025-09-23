/**
 * Tag extends DBObject and references a DBObject via object_reference.
 */
import type { DBObject } from '../Object/Object.js';
import type { UID } from '../Common/Ids.js';

export interface Tag extends DBObject {
    object_reference: UID; // uid of the referenced DBObject
}
