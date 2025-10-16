/**
 * DBObject represents the base entity stored in the database.
 * - uid: unique identifier
 * - name: canonical name
 * - friendly_name: human readable label
 */
import type { UID } from '../Common/Ids.js';

export interface DBObject {
    uid: UID; // unique id for the object
    name: string; // canonical name
    friendly_name: string; // human readable label
    id: string; // Neo4j internal id (mapped from uid)
}

/**
 * Concrete implementation of ObjectRepository using the BaseRepository.
 * Provides CRUD operations for DBObject entities stored in Neo4j.
 */

import { BaseRepository } from '../BaseRepository.js';
import { Neo4jClient } from '../Neo4jClient.js';
import type { Neo4jObjectSchema, Neo4jRepositoryOptions, Neo4jQueryResult } from '../../Types/Repository/index.js';

/**
 * Schema definition for DBObject to Neo4j mapping.
 */
const dbObjectSchema: Neo4jObjectSchema<DBObject> = {
    primaryLabel: `DBObject`,
    additionalLabels: [`Entity`],
    propertyMappings: {
        id: {
            neo4jName: `id`,
            required: true,
        },
        uid: {
            neo4jName: `uid`,
            required: true,
        },
        name: {
            neo4jName: `name`,
            required: true,
        },
        friendly_name: {
            neo4jName: `friendly_name`,
            required: false,
            defaultValue: ``,
        },
    },
    indexes: [
        {
            name: `dbobject_uid_unique`,
            properties: [`uid`],
            unique: true,
        },
        {
            name: `dbobject_name_index`,
            properties: [`name`],
        },
    ],
    constraints: [
        {
            name: `dbobject_uid_required`,
            type: `EXISTENCE`,
            properties: [`uid`],
        },
        {
            name: `dbobject_name_required`,
            type: `EXISTENCE`,
            properties: [`name`],
        },
    ],
};

/**
 * Repository for managing DBObject entities in Neo4j.
 * Extends BaseRepository to provide type-safe CRUD operations.
 */
export class ObjectRepository extends BaseRepository<DBObject> {
    /**
     * Initialize ObjectRepository with Neo4j client.
     * @param client Neo4j client instance
     * @param options Repository options
     */
    constructor(client: Neo4jClient, options: Neo4jRepositoryOptions = {}) {
        super(client, dbObjectSchema, options);
    }

    /**
     * Find objects by name (case-insensitive search).
     * @param name Name to search for
     * @param options Query options
     */
    async findByName(
        name: string,
        options: { limit?: number; skip?: number } = {},
    ): Promise<Neo4jQueryResult<DBObject[]>> {
        try {
            const session = await this.client.GetSession(`READ`);
            const labels = this.getLabels().join(`:`);

            const query = `
                MATCH (n:${labels})
                WHERE toLower(n.name) CONTAINS toLower($name)
                   OR toLower(n.friendly_name) CONTAINS toLower($name)
                RETURN n
                ORDER BY n.name
                SKIP $skip LIMIT $limit
            `;

            const result = await session.run(query, {
                name,
                skip: options.skip || 0,
                limit: options.limit || 50,
            });
            await session.close();

            const entities = result.records.map(record => {
                const node = record.get(`n`) as any;
                return this.neo4jToDomain(node);
            });

            return { success: true, data: entities };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Unknown error occurred`,
            };
        }
    }

    /**
     * Find objects by UID pattern.
     * @param uidPattern UID pattern to match (supports wildcards)
     * @param options Query options
     */
    async findByUidPattern(
        uidPattern: string,
        options: { limit?: number; skip?: number } = {},
    ): Promise<Neo4jQueryResult<DBObject[]>> {
        try {
            const session = await this.client.GetSession(`READ`);
            const labels = this.getLabels().join(`:`);

            // Convert simple wildcard pattern to regex
            const regexPattern = uidPattern.replace(/\*/g, `.*`).replace(/\?/g, `.`);

            const query = `
                MATCH (n:${labels})
                WHERE n.uid =~ $pattern
                RETURN n
                ORDER BY n.uid
                SKIP $skip LIMIT $limit
            `;

            const result = await session.run(query, {
                pattern: regexPattern,
                skip: options.skip || 0,
                limit: options.limit || 50,
            });
            await session.close();

            const entities = result.records.map(record => {
                const node = record.get(`n`) as any;
                return this.neo4jToDomain(node);
            });

            return { success: true, data: entities };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Unknown error occurred`,
            };
        }
    }

    /**
     * Create multiple objects in a batch operation.
     * @param objects Array of objects to create
     */
    async createBatch(objects: Omit<DBObject, `uid`>[]): Promise<Neo4jQueryResult<DBObject[]>> {
        return this.executeInTransaction(async tx => {
            const createdObjects: DBObject[] = [];
            const labels = this.getLabels().join(`:`);

            for (const obj of objects) {
                const fullObject: DBObject = {
                    ...obj,
                    uid: this.generateId(),
                };

                const properties = this.domainToNeo4jProperties(fullObject);
                const result = await tx.run(`CREATE (n:${labels} $props) RETURN n`, { props: properties });

                if (result.data && result.data.length > 0) {
                    const node = result.data[0].get(`n`) as any;
                    createdObjects.push(this.neo4jToDomain(node));
                }
            }

            return createdObjects;
        });
    }

    /**
     * Get objects with relationships.
     * @param id Object ID
     * @param relationshipTypes Types of relationships to include
     */
    async getWithRelationships(
        id: string,
        relationshipTypes: string[] = [],
    ): Promise<Neo4jQueryResult<{ object: DBObject; relationships: any[] } | null>> {
        try {
            const session = await this.client.GetSession(`READ`);
            const labels = this.getLabels().join(`:`);

            let relationshipClause = ``;
            if (relationshipTypes.length > 0) {
                const types = relationshipTypes.map(type => {
                    return `r:${type}`;
                }).join(`|`);
                relationshipClause = `OPTIONAL MATCH (n)-[r:${types}]-(related) RETURN n, collect({relationship: type(r), direction: 'outgoing', related: related}) as outgoing_rels, collect({relationship: type(r), direction: 'incoming', related: related}) as incoming_rels`;
            } else {
                relationshipClause = `RETURN n, [] as outgoing_rels, [] as incoming_rels`;
            }

            const query = `
                MATCH (n:${labels} {uid: $id})
                ${relationshipClause}
            `;

            const result = await session.run(query, { id });
            await session.close();

            if (result.records.length === 0) {
                return { success: true, data: null };
            }

            const record = result.records[0];
            const node = record.get(`n`) as any;
            const outgoingRels = record.get(`outgoing_rels`) || [];
            const incomingRels = record.get(`incoming_rels`) || [];

            const object = this.neo4jToDomain(node);
            const relationships = [...outgoingRels, ...incomingRels];

            return {
                success: true,
                data: { object, relationships },
            };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Unknown error occurred`,
            };
        }
    }

    /**
     * Override ID generation for DBObject to use uid format.
     */
    protected generateId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `obj_${timestamp}_${random}`.toUpperCase();
    }
}

/**
 * Factory function to create ObjectRepository instance.
 * @param client Neo4j client instance
 * @param options Repository options
 */
export function createObjectRepository(client: Neo4jClient, options: Neo4jRepositoryOptions = {}): ObjectRepository {
    return new ObjectRepository(client, options);
}
