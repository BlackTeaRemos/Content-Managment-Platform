export * from './normalizeToken.js';
export * from './normalizeSegment.js';
export * from './tokenKey.js';
export * from './formatPermissionToken.js';
import type { PermissionToken, PermissionTokenInput, TokenSegmentInput } from './types.js';
import type { EventIdentifierSubset } from '../ComplexEventEmitter.js';

const NUMERIC_SEGMENT = /^(?:-?(?:0|[1-9]\d*))$/;

/**
 * Converts a raw segment value into a ComplexEventEmitter compatible representation.
 * @param segment TokenSegmentInput Raw template fragment to normalize (example: '123').
 * @returns EventIdentifierSubset Normalized segment ready for token usage (example: 123).
 * @example
 * normalizeSegment('123');
 */
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

/**
 * Converts various token representations into a standard array-based token.
 * @param token PermissionTokenInput Token provided by callers (example: 'command:create').
 * @returns PermissionToken Normalized token structured for array semantics (example: ['command','create']).
 * @example
 * normalizeToken('command:create');
 */
export function normalizeToken(token: PermissionTokenInput): PermissionToken {
    if (Array.isArray(token)) {
        return token.map(segment => normalizeSegment(segment)) as PermissionToken;
    }
    if (typeof token === 'string') {
        const trimmed = token.trim();
        if (!trimmed) return [];
        return trimmed.split(':').map(part => normalizeSegment(part)) as PermissionToken;
    }
    return [];
}

/**
 * Generates a canonical string representation for a token.
 * @param token PermissionToken Token to serialize (example: ['command','create']).
 * @returns string Unique identifier for use in sets and maps (example: 's:command|s:create').
 * @example
 * tokenKey(['command', 'create']);
 */
export function tokenKey(token: PermissionToken): string {
    return token
        .map(part => {
            if (part === undefined) return 'u:';
            if (typeof part === 'number') return `n:${part}`;
            if (typeof part === 'boolean') return `b:${part ? '1' : '0'}`;
            return `s:${part}`;
        })
        .join('|');
}

/**
 * Formats a token for human-readable output.
 * @param token PermissionToken Token to format (example: ['command','create']).
 * @returns string Formatted representation using colon separators (example: 'command:create').
 * @example
 * formatPermissionToken(['command', 'create']);
 */
export function formatPermissionToken(token: PermissionToken): string {
    if (!token.length) return 'EMPTY';
    return token
        .map(part => {
            if (part === undefined) return '*';
            return String(part);
        })
        .join(':');
}
