// Removed Sapphire container; logging directly to console

/**
 * Returns the current timestamp in ISO format.
 * @returns string - Current ISO timestamp
 * @example
 * const ts = GetTimestamp(); // '2025-06-24T12:34:56.789Z'
 */
export function GetTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Log levels for application logging.
 */
export enum LogLevel {
    Critical = 'CRITICAL',
    Error = 'ERROR',
    Warning = 'WARNING',
    Info = 'INFO',
    Debug = 'DEBUG',
}

/**
 * Logs a message at the specified log level using Sapphire's logger, prepending a timestamp.
 * @param level LogLevel - Level of the log
 * @param message string - Message to log
 * @param context string - Optional context or source identifier
 * @example
 * log(LogLevel.Info, 'Server started', 'App');
 */
export function log(level: LogLevel, message: string, from: string, context?: string): void {
    const timestamp = GetTimestamp();
    const body = context ? `[${context}] ${message}` : message;
    const formatted = `[${timestamp}] [${from}] ${body}`;
    const logger = console;

    switch (level) {
        case LogLevel.Critical:
        case LogLevel.Error:
            logger.error(formatted);
            break;
        case LogLevel.Warning:
            logger.warn(formatted);
            break;
        case LogLevel.Info:
            logger.info ? logger.info(formatted) : logger.log(formatted);
            break;
        case LogLevel.Debug:
            logger.debug ? logger.debug(formatted) : logger.log(formatted);
            break;
    }
}

/**
 * Shorthand for critical logs.
 * @param message string - Message to log
 * @param context string - Optional context or source identifier
 */
export namespace log {
    /**
     * Logs a critical level message.
     * @param message string - Message to log
     * @param from string - Context or source identifier
     * @param context string - Optional additional context or details
     */
    export function critical(message: string, from: string, context?: string): void {
        log(LogLevel.Critical, message, from, context);
    }

    /**
     * Logs an error level message.
     * @param message string - Message to log
     * @param from string - Context or source identifier
     * @param context string - Optional additional context or details
     */
    export function error(message: string, from: string, context?: string): void {
        log(LogLevel.Error, message, from, context);
    }

    /**
     * Logs a warning level message.
     * @param message string - Message to log
     * @param from string - Context or source identifier
     * @param context string - Optional additional context or details
     */
    export function warning(message: string, from: string, context?: string): void {
        log(LogLevel.Warning, message, from, context);
    }

    /**
     * Logs an informational level message.
     * @param message string - Message to log
     * @param from string - Context or source identifier
     * @param context string - Optional additional context or details
     */
    export function info(message: string, from: string, context?: string): void {
        log(LogLevel.Info, message, from, context);
    }

    /**
     * Logs a debug level message.
     * @param message string - Message to log
     * @param from string - Context or source identifier
     * @param context string - Optional additional context or details
     */
    export function debug(message: string, from: string, context?: string): void {
        log(LogLevel.Debug, message, from, context);
    }

    /**
     * Builds a location string for logs.
     * @param dirname string - Directory name
     * @param className string - Class or module name
     * @param funcName string - Function name (optional)
     * @returns string - Combined path for context
     * @example
     * const loc = log.Helper_LocationBuilder(__dirname, 'MyClass', 'myMethod');
     */
    export function Helper_LocationBuilder(dirname: string, className: string, funcName?: string): string {
        return `${dirname}/${className}${funcName ? `/${funcName}` : ''}`;
    }
}

/** Public alias using CamelCase (preferred). */
export function Log(level: LogLevel, message: string, from: string, context?: string): void {
    // delegate
    log(level, message, from, context);
}
/** Private/legacy style alias with leading double underscore to illustrate migration pattern. */
export function __Log(level: LogLevel, message: string, from: string, context?: string): void {
    // delegate
    log(level, message, from, context);
}
