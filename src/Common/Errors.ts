/**
 * Error taxonomy for the VPI system.
 * Provides a structured hierarchy with machine-readable codes, preserving original causes, and
 * optional metadata for diagnostics & telemetry.
 *
 * Conventions:
 * - Class names are PascalCase.
 * - Error codes are SNAKE_CASE and globally unique.
 * - Each error includes `code`, optional `details`, and optional `cause` chain.
 * - Use specific subclasses instead of the base `AppError` wherever possible.
 */

/** Well-known application error codes (extend as needed). */
export const ERROR_CODES = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    POLICY_ERROR: 'POLICY_ERROR',
    STORAGE_ERROR: 'STORAGE_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** Union type of all known error code string literals. */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Base application error carrying a machine code and structured details.
 */
export class AppError extends Error {
    /** Machine readable error code (SNAKE_CASE). */
    public readonly code: ErrorCode;
    /** Arbitrary structured metadata for diagnostics (NOT user-facing secrets). */
    public readonly details?: Record<string, any>;
    /** Underlying cause error (if any). */
    public readonly cause?: unknown;

    /**
     * Constructs a new AppError.
     * @param code ErrorCode - Machine error code (see ERROR_CODES)
     * @param message string - Human readable summary (safe to show to end user unless security-sensitive)
     * @param details Record<string,any>|undefined - Additional structured context (object identifiers, etc.)
     * @param cause unknown - Original error object or value
     */
    constructor(code: ErrorCode, message: string, details?: Record<string, any>, cause?: unknown) {
        super(message);
        this.code = code;
        this.details = details;
        this.cause = cause;
        // Maintain proper prototype chain (TS/JS quirk)
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/** ValidationError indicates user input / configuration failed schema or semantic validation. */
export class ValidationError extends AppError {
    /**
     * @param message string - Description of validation failure
     * @param details Record<string,any>|undefined - Offending field info, schema path, etc.
     */
    constructor(message: string, details?: Record<string, any>) {
        super(ERROR_CODES.VALIDATION_ERROR, message, details);
    }
}

/** PolicyError indicates access / authorization / disclosure rules denied action. */
export class PolicyError extends AppError {
    constructor(message: string, details?: Record<string, any>) {
        super(ERROR_CODES.POLICY_ERROR, message, details);
    }
}

/** StorageError represents persistence layer failures (Discord API, I/O, etc.). */
export class StorageError extends AppError {
    constructor(message: string, details?: Record<string, any>, cause?: unknown) {
        super(ERROR_CODES.STORAGE_ERROR, message, details, cause);
    }
}

/** NotFoundError when requested entity (object, transaction, resource) does not exist. */
export class NotFoundError extends AppError {
    constructor(message: string, details?: Record<string, any>) {
        super(ERROR_CODES.NOT_FOUND, message, details);
    }
}

/** ConflictError for optimistic concurrency / duplicate creation races. */
export class ConflictError extends AppError {
    constructor(message: string, details?: Record<string, any>) {
        super(ERROR_CODES.CONFLICT, message, details);
    }
}

/** Generic internal error wrapper when no more specific category applies. */
export class InternalError extends AppError {
    constructor(message: string, details?: Record<string, any>, cause?: unknown) {
        super(ERROR_CODES.INTERNAL_ERROR, message, details, cause);
    }
}
