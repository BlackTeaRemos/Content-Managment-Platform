/**
 * Neo4j-backed implementation of ObjectRepository.
 * Data model: each object is a (:VPIObject {id, objectType, label, version, updatedAt, createdAt, tags, historyPointer, open, closed, __meta})
 * Transactions are stored as (:Transaction {transactionId, resultingVersion, committedAt, authorUserId, operation, ops, fieldTagsDelta, hash, previousHash})
 * linked via [:APPLIED_TO] to the object and [:PREVIOUS] chain.
 */
import type { ObjectRepository, ObjectEnvelope, TransactionRecord, CursorToken } from '../Domain/index.js';
import { Neo4jClient, type Neo4jConfig } from './Neo4jClient.js';

export interface Neo4jRepositoryOptions extends Neo4jConfig {
    guildId: string; // scope partition key
}

/**
 * Minimal viable repository to unblock integration work. It focuses on core flows (Create/Get/Update/List/History)
 * and defers compaction and advanced indexing to follow-ups.
 */
export class Neo4jObjectRepository implements ObjectRepository {
    private _client: Neo4jClient; // neo4j client
    private _guildId: string; // partition key

    constructor(opts: Neo4jRepositoryOptions) {
        this._client = new Neo4jClient(opts);
        this._guildId = opts.guildId;
    }

    /** Initialize connection. Safe to call multiple times. */
    async Init(): Promise<void> {
        await this._client.Init();
    }

    /** Create a new object node and initial transaction. */
    async Create(envelope: ObjectEnvelope, initialTx: TransactionRecord): Promise<ObjectEnvelope> {
        await this.Init();
        const session = await this._client.GetSession('WRITE');

        try {
            const result = await session.executeWrite(async tx => {
                const query = `
          MERGE (g:Guild { id: $guildId })
          MERGE (o:VPIObject { id: $id, guildId: $guildId })
          ON CREATE SET o.objectType = $objectType, o.label = $label,
                        o.version = $version, o.updatedAt = $updatedAt, o.createdAt = $createdAt,
                        o.tags = $tags, o.historyPointer = $historyPointer,
                        o.open = $open, o.closed = $closed, o.__meta = $__meta
          ON MATCH SET o.objectType = $objectType, o.label = $label,
                       o.version = $version, o.updatedAt = $updatedAt,
                       o.tags = $tags, o.historyPointer = $historyPointer,
                       o.open = $open, o.closed = $closed, o.__meta = $__meta
          MERGE (t:Transaction { transactionId: $transactionId })
          SET t += $txProps
          MERGE (t)-[:APPLIED_TO]->(o)
          RETURN o as obj`;
                const txProps = { ...initialTx } as any;
                const params = {
                    guildId: this._guildId,
                    id: envelope.id,
                    objectType: envelope.objectType,
                    label: envelope.label ?? null,
                    version: envelope.version,
                    updatedAt: envelope.updatedAt,
                    createdAt: envelope.createdAt,
                    tags: envelope.tags ?? [],
                    historyPointer: envelope.historyPointer,
                    open: envelope.open ?? {},
                    closed: envelope.closed ?? {},
                    __meta: envelope.__meta ?? {},
                    transactionId: initialTx.transactionId,
                    txProps,
                };
                const res = await tx.run(query, params);
                return res.records[0]?.get('obj') ?? null;
            });

            if (!result) {
                throw new Error('Failed to create object');
            }
            return envelope;
        } finally {
            await session.close();
        }
    }

    /** Retrieve latest snapshot for an id. */
    async Get(id: string): Promise<ObjectEnvelope | null> {
        await this.Init();
        const session = await this._client.GetSession('READ');

        try {
            const query = `
        MATCH (o:VPIObject { id: $id, guildId: $guildId })
        RETURN o AS obj`;
            const res = await session.run(query, { id, guildId: this._guildId });
            const node = res.records[0]?.get('obj');
            return node ? (node.properties as unknown as ObjectEnvelope) : null;
        } finally {
            await session.close();
        }
    }

    /** Apply an update by bumping version, writing tx and updating fields. */
    async Update(id: string, txRec: TransactionRecord): Promise<ObjectEnvelope> {
        await this.Init();
        const session = await this._client.GetSession('WRITE');

        try {
            const result = await session.executeWrite(async tx => {
                const query = `
          MATCH (o:VPIObject { id: $id, guildId: $guildId })
          SET o.version = $version,
              o.updatedAt = $updatedAt,
              o.open = coalesce($open,o.open),
              o.closed = coalesce($closed,o.closed),
              o.__meta = coalesce($__meta,o.__meta)
          WITH o
          MERGE (t:Transaction { transactionId: $transactionId })
          SET t += $txProps
          MERGE (t)-[:APPLIED_TO]->(o)
          RETURN o as obj`;
                const params: any = {
                    id,
                    guildId: this._guildId,
                    version: txRec.resultingVersion,
                    updatedAt: txRec.committedAt,
                    open: (txRec as any).__openPatch,
                    closed: (txRec as any).__closedPatch,
                    __meta: (txRec as any).__metaPatch,
                    transactionId: txRec.transactionId,
                    txProps: { ...txRec },
                };
                const res = await tx.run(query, params);
                return res.records[0]?.get('obj') ?? null;
            });

            if (!result) {
                throw new Error('Update failed – object not found');
            }
            // Return fresh snapshot
            const latest = await this.Get(id);

            if (!latest) {
                throw new Error('Updated object not found after write');
            }
            return latest;
        } finally {
            await session.close();
        }
    }

    /** List objects with optional filters and naive cursor pagination. */
    async List(filter?: {
        objectType?: string;
        tags?: string[];
        cursor?: CursorToken;
    }): Promise<{ objects: ObjectEnvelope[]; nextCursor?: CursorToken }> {
        await this.Init();
        const pageSize = filter?.cursor?.pageSize ?? 50;
        const offset = filter?.cursor?.offset ?? 0;
        const session = await this._client.GetSession('READ');

        try {
            const query = `
        MATCH (o:VPIObject { guildId: $guildId })
        WHERE ($objectType IS NULL OR o.objectType = $objectType)
          AND ($tags IS NULL OR ALL(t IN $tags WHERE t IN o.tags))
        WITH o
        ORDER BY o.updatedAt DESC
        SKIP $offset LIMIT $limit
        RETURN collect(o) AS objs`;
            const res = await session.run(query, {
                guildId: this._guildId,
                objectType: filter?.objectType ?? null,
                tags: filter?.tags ?? null,
                offset,
                limit: pageSize,
            });
            const nodes = (res.records[0]?.get('objs') ?? []) as any[];
            const objects = nodes.map(n => n.properties as ObjectEnvelope);
            const nextCursor = objects.length === pageSize ? { offset: offset + pageSize, pageSize } : undefined;
            return { objects, nextCursor };
        } finally {
            await session.close();
        }
    }

    /** Return appended transactions for an object. */
    async History(id: string, fromVersion?: number, toVersion?: number): Promise<TransactionRecord[]> {
        await this.Init();
        const session = await this._client.GetSession('READ');

        try {
            const query = `
        MATCH (o:VPIObject { id: $id, guildId: $guildId })<-[:APPLIED_TO]-(t:Transaction)
        WHERE ($from IS NULL OR t.resultingVersion >= $from)
          AND ($to IS NULL OR t.resultingVersion <= $to)
        RETURN t ORDER BY t.committedAt ASC`;
            const res = await session.run(query, {
                id,
                guildId: this._guildId,
                from: fromVersion ?? null,
                to: toVersion ?? null,
            });
            return res.records.map(r => (r.get('t') as any).properties as TransactionRecord);
        } finally {
            await session.close();
        }
    }
}
