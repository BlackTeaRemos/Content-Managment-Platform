/**
 * JsonRef represents a reference to JSON content. This can be a URI, a storage key,
 * or an inline JSON object depending on the repository implementation.
 * @example { type: 'inline', value: { a: 1 } }
 * @example { type: 'key', value: 'info/objects/123/open.json' }
 */
export type JsonRef =
    | { type: `inline`; value: unknown }
    | { type: `key`; value: string } // reference key in storage layer
    | { type: `uri`; value: string }; // external URI
