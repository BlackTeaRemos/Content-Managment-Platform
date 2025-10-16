import type { TokenSegmentInput } from './types.js';
import type { EventIdentifierSubset } from '../ComplexEventEmitter.js';

const NUMERIC_SEGMENT = /^(?:-?(?:0|[1-9]\d*))$/;

export function normalizeSegment(segment: TokenSegmentInput): EventIdentifierSubset {
    if (segment === undefined || segment === null) return undefined;
    if (typeof segment === 'boolean' || typeof segment === 'number') return segment;
    const value = String(segment).trim();
    if (!value.length) return undefined;
    if (value === '*') return undefined;
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (NUMERIC_SEGMENT.test(value)) {
        const num = Number(value);
        if (Number.isSafeInteger(num)) return num;
    }
    return value;
}
