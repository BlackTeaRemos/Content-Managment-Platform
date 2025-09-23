/**
 * MetricsService provides in-memory counters & gauges used during Stage 8 instrumentation.
 * Extremely lightweight; intentionally synchronous. In multi-process / sharded scenarios this would
 * be replaced with a centralized collector or exported periodically.
 *
 * Naming rules follow project conventions: camelCase for public, _camelCase for private/internal.
 */

export interface MetricsSnapshot {
    cacheHits: number; // number of successful cache lookups
    cacheMisses: number; // number of failed cache lookups
    policyAllowClosed: number; // access policy decisions that allowed closed content
    policyDenyClosed: number; // access policy decisions that denied closed content
    eventsPublished: Record<string, number>; // counts per event name
    collectedAt: number; // epoch ms when snapshot taken
}

/** Internal mutable state container */
interface MutableMetricsState extends MetricsSnapshot {}

/**
 * MetricsService – central mutable counter set.
 */
export class MetricsService {
    private _state: MutableMetricsState = {
        cacheHits: 0,
        cacheMisses: 0,
        policyAllowClosed: 0,
        policyDenyClosed: 0,
        eventsPublished: {},
        collectedAt: Date.now(),
    };

    /** Increment cache hit counter */
    public IncCacheHit(): void {
        this._state.cacheHits++;
    }
    /** Increment cache miss counter */
    public IncCacheMiss(): void {
        this._state.cacheMisses++;
    }
    /** Record a policy decision outcome */
    public RecordPolicy(allowClosed: boolean): void {
        if (allowClosed) {
            this._state.policyAllowClosed++;
        } else {
            this._state.policyDenyClosed++;
        }
    }
    /** Increment event publish counter */
    public IncEvent(eventName: string): void {
        if (!this._state.eventsPublished[eventName]) {
            this._state.eventsPublished[eventName] = 0;
        }
        this._state.eventsPublished[eventName]++;
    }

    /** Obtain a point-in-time immutable snapshot */
    public Snapshot(): MetricsSnapshot {
        return {
            cacheHits: this._state.cacheHits,
            cacheMisses: this._state.cacheMisses,
            policyAllowClosed: this._state.policyAllowClosed,
            policyDenyClosed: this._state.policyDenyClosed,
            eventsPublished: { ...this._state.eventsPublished },
            collectedAt: Date.now(),
        };
    }

    /** Reset all counters (primarily for tests) */
    public Reset(): void {
        this._state.cacheHits = 0;
        this._state.cacheMisses = 0;
        this._state.policyAllowClosed = 0;
        this._state.policyDenyClosed = 0;
        this._state.eventsPublished = {};
    }
}

/** Global singleton instance (simple; replace with DI later). */
export const metricsService = new MetricsService();
