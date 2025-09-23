/**
 * Information holds open/closed/meta JSON references associated with an entity.
 */
import type { UID } from '../Common/Ids.js';
import type { JsonRef } from '../Common/JSON.js';

export interface Information {
    uid: UID; // unique id of the information entity
    open: JsonRef; // reference to open JSON content
    closed: JsonRef; // reference to closed JSON content
    meta: JsonRef; // reference to metadata JSON content
}
