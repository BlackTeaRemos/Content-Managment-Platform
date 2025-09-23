/**
 * Interfaces and types for Neo4j object translation and repository operations.
 * Defines schematics for mapping domain objects to Neo4j nodes and back.
 */

/**
 * Represents a Neo4j node with its properties and labels.
 */
export interface Neo4jNode {
    /** Neo4j internal ID */
    identity: number;
    /** Node labels (e.g., ['User', 'Entity']) */
    labels: string[];
    /** Node properties as key-value pairs */
    properties: Record<string, any>;
}

/**
 * Schema definition for mapping domain objects to Neo4j nodes.
 * Defines how object properties are translated to/from Neo4j.
 */
export interface Neo4jObjectSchema<TDomain = any> {
    /** Primary label for the Neo4j node */
    primaryLabel: string;
    /** Additional labels to apply */
    additionalLabels?: string[];
    /** Property mappings from domain to Neo4j */
    propertyMappings: Record<keyof TDomain, Neo4jPropertyMapping>;
    /** Relationships this object participates in */
    relationships?: Neo4jRelationshipMapping[];
    /** Indexes to create for this node type */
    indexes?: Neo4jIndexDefinition[];
    /** Constraints to apply */
    constraints?: Neo4jConstraintDefinition[];
}

/**
 * Defines how a single property is mapped between domain and Neo4j.
 */
export interface Neo4jPropertyMapping {
    /** Neo4j property name (defaults to domain property name if not specified) */
    neo4jName?: string;
    /** Whether this property is required */
    required?: boolean;
    /** Default value if property is missing */
    defaultValue?: any;
    /** Type transformation function */
    transform?: {
        /** Transform from domain to Neo4j */
        toNeo4j?: (value: any) => any;
        /** Transform from Neo4j to domain */
        fromNeo4j?: (value: any) => any;
    };
}

/**
 * Defines a relationship mapping for Neo4j.
 */
export interface Neo4jRelationshipMapping {
    /** Relationship type */
    type: string;
    /** Direction of the relationship */
    direction: 'OUTGOING' | 'INCOMING' | 'BOTH';
    /** Target node labels */
    targetLabels: string[];
    /** Property name in domain object that holds the relationship */
    propertyName?: string;
    /** Whether this relationship is required */
    required?: boolean;
}

/**
 * Index definition for Neo4j.
 */
export interface Neo4jIndexDefinition {
    /** Index name */
    name: string;
    /** Properties to index */
    properties: string[];
    /** Index type */
    type?: 'BTREE' | 'FULLTEXT' | 'VECTOR';
    /** Whether this is a unique index */
    unique?: boolean;
}

/**
 * Constraint definition for Neo4j.
 */
export interface Neo4jConstraintDefinition {
    /** Constraint name */
    name: string;
    /** Constraint type */
    type: 'UNIQUENESS' | 'EXISTENCE' | 'NODE_KEY';
    /** Properties involved in the constraint */
    properties: string[];
    /** Labels this constraint applies to */
    labels?: string[];
}

/**
 * Query result wrapper for Neo4j operations.
 */
export interface Neo4jQueryResult<T = any> {
    /** Whether the operation was successful */
    success: boolean;
    /** Result data */
    data?: T;
    /** Error message if operation failed */
    error?: string;
    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Options for Neo4j repository operations.
 */
export interface Neo4jRepositoryOptions {
    /** Neo4j database name */
    database?: string;
    /** Whether to enable query logging */
    enableLogging?: boolean;
    /** Query timeout in milliseconds */
    timeout?: number;
    /** Batch size for bulk operations */
    batchSize?: number;
}

/**
 * Base interface for objects that can be stored in Neo4j.
 */
export interface Neo4jStorable {
    /** Unique identifier for the object */
    id: string;
    /** Creation timestamp */
    createdAt?: Date | number;
    /** Last update timestamp */
    updatedAt?: Date | number;
    /** Version for optimistic locking */
    version?: number;
}

/**
 * Query builder interface for constructing Neo4j queries.
 */
export interface Neo4jQueryBuilder {
    /** Add a MATCH clause */
    match(pattern: string, params?: Record<string, any>): Neo4jQueryBuilder;
    /** Add a WHERE clause */
    where(condition: string, params?: Record<string, any>): Neo4jQueryBuilder;
    /** Add a RETURN clause */
    return(fields: string): Neo4jQueryBuilder;
    /** Add an ORDER BY clause */
    orderBy(fields: string): Neo4jQueryBuilder;
    /** Add a LIMIT clause */
    limit(count: number): Neo4jQueryBuilder;
    /** Add a SKIP clause */
    skip(count: number): Neo4jQueryBuilder;
    /** Build the final query */
    build(): { query: string; params: Record<string, any> };
}

/**
 * Transaction context for Neo4j operations.
 */
export interface Neo4jTransactionContext {
    /** Execute a query within this transaction */
    run(query: string, params?: Record<string, any>): Promise<Neo4jQueryResult>;
    /** Commit the transaction */
    commit(): Promise<void>;
    /** Rollback the transaction */
    rollback(): Promise<void>;
    /** Check if transaction is active */
    isActive(): boolean;
}
