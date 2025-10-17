import type { TokenSegmentInput } from './types.js';
import type { EventIdentifierSubset } from '../ComplexEventEmitter.js';

const NUMERIC_SEGMENT = /^(?:-?(?:0|[1-9]\d*))$/;

/**
 * Converts a raw segment value into a ComplexEventEmitter compatible representation.
 *
 * This function normalizes various input types (strings, numbers, booleans) into standardized event identifier subsets,
 * handling special cases like wildcards and type conversions.
 *
 * @param segment - The raw segment input to normalize.
 *   Example: '123' or true
 * @returns A normalized EventIdentifierSubset for token usage.
 *   Example: 123 or true
 */
export function normalizeSegment(segment: TokenSegmentInput): EventIdentifierSubset {
    if (segment === undefined || segment === null) {
        return undefined;
    }
    if (typeof segment === `boolean` || typeof segment === `number`) {
        return segment;
    }
    const value = String(segment).trim();
    if (!value.length) {
        return undefined;
    }
    if (value === `*`) {
        return undefined;
    }
    const lower = value.toLowerCase();
    if (lower === `true`) {
        return true;
    }
    if (lower === `false`) {
        return false;
    }
    if (NUMERIC_SEGMENT.test(value)) {
        const num = Number(value);
        if (Number.isSafeInteger(num)) {
            return num;
        }
    }
    return value;
}
