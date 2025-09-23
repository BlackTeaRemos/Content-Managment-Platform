/**
 * User represents a person using the system.
 * A user can belong to multiple organizations.
 */
import type { DBObject } from '../Object/Object.js';
import type { UID } from '../Common/Ids.js';

export interface User extends DBObject {
    discord_id: string; // Discord user id
    organizations: UID[]; // list of Organization.uids this user belongs to
}
