/**
 * Abstract base repository class providing common CRUD operations for Neo4j-backed entities.
 * Defines the ability to instance or save objects from/to the database.
 */

import { Neo4jClient } from './Neo4jClient.js';
import type {
    Neo4jObjectSchema,
    Neo4jStorable,
    Neo4jQueryResult,
    Neo4jRepositoryOptions,
    Neo4jNode,
    Neo4jTransactionContext,
} from '../Types/Repository/index.js';

/**
 * Abstract base repository providing common database operations.
 * Concrete implementations should extend this class and provide schema-specific logic.
 */
export abstract class BaseRepository<T extends Neo4jStorable> {
    protected client: Neo4jClient;
    protected schema: Neo4jObjectSchema<T>;
    protected options: Neo4jRepositoryOptions;

    /**
     * Initialize the repository with Neo4j client and schema.
     * @param client Neo4j client instance
     * @param schema Schema definition for the entity
     * @param options Repository options
     */
    constructor(client: Neo4jClient, schema: Neo4jObjectSchema<T>, options: Neo4jRepositoryOptions = {}) {
        this.client = client;
        this.schema = schema;
        this.options = {
            database: `neo4j`,
            enableLogging: false,
            timeout: 30000,
            batchSize: 100,
            ...options,
        };
    }

    /**
     * Initialize the repository (create indexes, constraints, etc.).
     */
    async initialize(): Promise<void> {
        await this.client.Init();

        // Create indexes
        if (this.schema.indexes) {
            for (const index of this.schema.indexes) {
                await this.createIndex(index);
            }
        }

        // Create constraints
        if (this.schema.constraints) {
            for (const constraint of this.schema.constraints) {
                await this.createConstraint(constraint);
            }
        }
    }

    /**
     * Create an index in Neo4j.
     */
    private async createIndex(indexDef: any): Promise<void> {
        const session = await this.client.GetSession(`WRITE`);
        try {
            const labels = [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])].join(`:`);
            const properties = indexDef.properties
                .map((p: string) => {
                    return `\`${p}\``;
                })
                .join(`, `);

            if (indexDef.unique) {
                const query = `CREATE CONSTRAINT \`${indexDef.name}\` IF NOT EXISTS FOR (n:${labels}) REQUIRE (${properties}) IS UNIQUE`;
                await session.run(query);
            } else {
                const query = `CREATE INDEX \`${indexDef.name}\` IF NOT EXISTS FOR (n:${labels}) ON (${properties})`;
                await session.run(query);
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Create a constraint in Neo4j.
     */
    private async createConstraint(constraintDef: any): Promise<void> {
        const session = await this.client.GetSession(`WRITE`);
        try {
            const labels = constraintDef.labels || [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])];
            const labelStr = labels.join(`:`);
            const properties = constraintDef.properties
                .map((p: string) => {
                    return `\`${p}\``;
                })
                .join(`, `);

            let query: string;
            switch (constraintDef.type) {
                case `UNIQUENESS`:
                    query = `CREATE CONSTRAINT \`${constraintDef.name}\` IF NOT EXISTS FOR (n:${labelStr}) REQUIRE (${properties}) IS UNIQUE`;
                    break;
                case `EXISTENCE`:
                    query = `CREATE CONSTRAINT \`${constraintDef.name}\` IF NOT EXISTS FOR (n:${labelStr}) REQUIRE n.\`${constraintDef.properties[0]}\` IS NOT NULL`;
                    break;
                case `NODE_KEY`:
                    query = `CREATE CONSTRAINT \`${constraintDef.name}\` IF NOT EXISTS FOR (n:${labelStr}) REQUIRE (${properties}) IS NODE KEY`;
                    break;
                default:
                    throw new Error(`Unknown constraint type: ${constraintDef.type}`);
            }

            await session.run(query);
        } finally {
            await session.close();
        }
    }

    /**
     * Convert domain object to Neo4j properties.
     */
    protected domainToNeo4jProperties(domain: Partial<T>): Record<string, any> {
        const properties: Record<string, any> = {};

        for (const [key, mapping] of Object.entries(this.schema.propertyMappings)) {
            const domainKey = key as keyof T;
            const neo4jKey = mapping.neo4jName || key;
            let value = domain[domainKey];

            // Apply default value if property is missing and required
            if (value === undefined && mapping.defaultValue !== undefined) {
                value = mapping.defaultValue;
            }

            // Apply transformation
            if (mapping.transform?.toNeo4j) {
                value = mapping.transform.toNeo4j(value);
            }

            // Only include non-undefined values
            if (value !== undefined) {
                properties[neo4jKey] = value;
            }
        }

        return properties;
    }

    /**
     * Convert Neo4j node to domain object.
     */
    protected neo4jToDomain(node: Neo4jNode): T {
        const domain: any = {};

        for (const [domainKey, mapping] of Object.entries(this.schema.propertyMappings)) {
            const neo4jKey = mapping.neo4jName || domainKey;
            let value = node.properties[neo4jKey];

            // Apply transformation
            if (mapping.transform?.fromNeo4j) {
                value = mapping.transform.fromNeo4j(value);
            }

            domain[domainKey] = value;
        }

        return domain as T;
    }

    /**
     * Create a new entity in the database.
     */
    async create(entity: Omit<T, `id` | `createdAt` | `updatedAt` | `version`>): Promise<Neo4jQueryResult<T>> {
        try {
            const session = await this.client.GetSession(`WRITE`);
            const now = Date.now();

            const fullEntity: T = {
                ...entity,
                id: this.generateId(),
                createdAt: now,
                updatedAt: now,
                version: 1,
            } as T;

            const properties = this.domainToNeo4jProperties(fullEntity);
            const labels = [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])].join(`:`);

            const query = `CREATE (n:${labels} $props) RETURN n`;

            const result = await session.run(query, { props: properties });
            await session.close();

            if (result.records.length === 0) {
                return { success: false, error: `Failed to create entity` };
            }

            const createdNode = result.records[0].get(`n`) as Neo4jNode;
            const createdEntity = this.neo4jToDomain(createdNode);

            return { success: true, data: createdEntity };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Unknown error occurred`,
            };
        }
    }

    /**
     * Find an entity by ID.
     */
    async findById(id: string): Promise<Neo4jQueryResult<T | null>> {
        try {
            const session = await this.client.GetSession(`READ`);
            const labels = [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])].join(`:`);

            const query = `MATCH (n:${labels} {id: $id}) RETURN n LIMIT 1`;
            const result = await session.run(query, { id });
            await session.close();

            if (result.records.length === 0) {
                return { success: true, data: null };
            }

            const node = result.records[0].get(`n`) as Neo4jNode;
            const entity = this.neo4jToDomain(node);

            return { success: true, data: entity };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Unknown error occurred`,
            };
        }
    }

    /**
     * Find entities matching criteria.
     */
    async find(
        criteria: Partial<T> = {},
        options: { limit?: number; skip?: number } = {},
    ): Promise<Neo4jQueryResult<T[]>> {
        try {
            const session = await this.client.GetSession(`READ`);
            const labels = [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])].join(`:`);

            const properties = this.domainToNeo4jProperties(criteria);
            const whereClause =
                Object.keys(properties).length > 0
                    ? `WHERE ${Object.keys(properties)
                          .map(key => {
                              return `n.\`${key}\` = $${key}`;
                          })
                          .join(` AND `)}`
                    : ``;

            const limitClause = options.limit ? `LIMIT ${options.limit}` : ``;
            const skipClause = options.skip ? `SKIP ${options.skip}` : ``;

            const query = `MATCH (n:${labels}) ${whereClause} RETURN n ${skipClause} ${limitClause}`;

            const result = await session.run(query, properties);
            await session.close();

            const entities = result.records.map(record => {
                const node = record.get(`n`) as Neo4jNode;
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
     * Update an existing entity.
     */
    async update(id: string, updates: Partial<T>): Promise<Neo4jQueryResult<T>> {
        try {
            const session = await this.client.GetSession(`WRITE`);
            const labels = [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])].join(`:`);

            // Get current entity for version check
            const findQuery = `MATCH (n:${labels} {id: $id}) RETURN n`;
            const findResult = await session.run(findQuery, { id });

            if (findResult.records.length === 0) {
                await session.close();
                return { success: false, error: `Entity not found` };
            }

            const currentNode = findResult.records[0].get(`n`) as Neo4jNode;
            const currentEntity = this.neo4jToDomain(currentNode);

            // Prepare update properties
            const updateProps = {
                ...this.domainToNeo4jProperties(updates),
                updatedAt: Date.now(),
                version: (currentEntity.version || 0) + 1,
            };

            const setClause = Object.keys(updateProps)
                .map(key => {
                    return `n.\`${key}\` = $${key}`;
                })
                .join(`, `);

            const updateQuery = `MATCH (n:${labels} {id: $id}) SET ${setClause} RETURN n`;
            const updateResult = await session.run(updateQuery, { id, ...updateProps });
            await session.close();

            if (updateResult.records.length === 0) {
                return { success: false, error: `Failed to update entity` };
            }

            const updatedNode = updateResult.records[0].get(`n`) as Neo4jNode;
            const updatedEntity = this.neo4jToDomain(updatedNode);

            return { success: true, data: updatedEntity };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Unknown error occurred`,
            };
        }
    }

    /**
     * Delete an entity by ID.
     */
    async delete(id: string): Promise<Neo4jQueryResult<boolean>> {
        try {
            const session = await this.client.GetSession(`WRITE`);
            const labels = [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])].join(`:`);

            const query = `MATCH (n:${labels} {id: $id}) DELETE n RETURN count(n) as deleted`;
            const result = await session.run(query, { id });
            await session.close();

            const deleted = (result.records[0]?.get(`deleted`) as number) || 0;

            return { success: true, data: deleted > 0 };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Unknown error occurred`,
            };
        }
    }

    /**
     * Count entities matching criteria.
     */
    async count(criteria: Partial<T> = {}): Promise<Neo4jQueryResult<number>> {
        try {
            const session = await this.client.GetSession(`READ`);
            const labels = [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])].join(`:`);

            const properties = this.domainToNeo4jProperties(criteria);
            const whereClause =
                Object.keys(properties).length > 0
                    ? `WHERE ${Object.keys(properties)
                          .map(key => {
                              return `n.\`${key}\` = $${key}`;
                          })
                          .join(` AND `)}`
                    : ``;

            const query = `MATCH (n:${labels}) ${whereClause} RETURN count(n) as count`;

            const result = await session.run(query, properties);
            await session.close();

            const count = (result.records[0]?.get(`count`) as number) || 0;

            return { success: true, data: count };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Unknown error occurred`,
            };
        }
    }

    /**
     * Execute a custom query within a transaction.
     */
    async executeInTransaction<T>(
        operation: (tx: Neo4jTransactionContext) => Promise<T>,
    ): Promise<Neo4jQueryResult<T>> {
        const session = await this.client.GetSession(`WRITE`);

        try {
            const result = await session.executeWrite(async tx => {
                const txContext: Neo4jTransactionContext = {
                    run: async(query: string, params?: Record<string, any>) => {
                        const res = await tx.run(query, params || {});
                        return {
                            success: true,
                            data: res.records,
                            metadata: res.summary,
                        };
                    },
                    commit: async() => {
                        /* Transaction will be committed automatically */
                    },
                    rollback: async() => {
                        /* Transaction will be rolled back on error */
                    },
                    isActive: () => {
                        return true;
                    },
                };

                return await operation(txContext);
            });

            return { success: true, data: result };
        } catch(error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : `Transaction failed`,
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Generate a unique ID for new entities.
     * Override this method in concrete implementations for custom ID generation.
     */
    protected generateId(): string {
        return `${this.schema.primaryLabel.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the Neo4j labels for this entity type.
     */
    protected getLabels(): string[] {
        return [this.schema.primaryLabel, ...(this.schema.additionalLabels || [])];
    }
}
