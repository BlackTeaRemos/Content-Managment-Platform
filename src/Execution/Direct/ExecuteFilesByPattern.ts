import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../Common/Log.js';

export enum DepthMode {
    UpToDepth, // Up to specific depth, including
    ExactDepth, // Only on specific depth
    AfterDepth, // After specific depth
}

interface SearchOptions {
    mode: DepthMode;
    depth: number;
}

async function __SearchFiles(
    currentPath: string,
    patterns: RegExp[],
    options: SearchOptions,
    currentDepth: number,
): Promise<string[]> {
    const shouldContinueSearch = (() => {
        switch (options.mode) {
            case DepthMode.UpToDepth:
                return currentDepth <= options.depth;
            case DepthMode.ExactDepth:
                return currentDepth <= options.depth;
            case DepthMode.AfterDepth:
                return true;
            default:
                return currentDepth <= options.depth;
        }
    })();

    if (!shouldContinueSearch) {
        return [];
    }

    let filesToExecute: string[] = [];
    try {
        const items = fs.readdirSync(currentPath);
        for (const item of items) {
            const itemPath = path.join(currentPath, item);
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
                filesToExecute = filesToExecute.concat(
                    await __SearchFiles(itemPath, patterns, options, currentDepth + 1),
                );
            } else if (
                stat.isFile() &&
                patterns.some(pattern => {
                    return pattern.test(item);
                })
            ) {
                const shouldAddFile = (() => {
                    switch (options.mode) {
                        case DepthMode.UpToDepth:
                            return currentDepth <= options.depth;
                        case DepthMode.ExactDepth:
                            return currentDepth === options.depth;
                        case DepthMode.AfterDepth:
                            return currentDepth > options.depth;
                        default:
                            return currentDepth <= options.depth;
                    }
                })();
                if (shouldAddFile) {
                    filesToExecute.push(itemPath);
                }
            }
        }
    } catch (error) {
        log.error(`Error processing directory ${currentPath}:`, error as any, import.meta.filename);
        throw new Error(`Directory access error: Failed to read directory at ${currentPath}`);
    }
    return filesToExecute;
}

async function __ExecuteFile(filePath: string): Promise<any> {
    try {
        const dynamicModule = await import(`file://${filePath}`);

        log.info(`Module keys from ${filePath}`, JSON.stringify(Reflect.ownKeys(dynamicModule), null, 2));

        const moduleKeys = Reflect.ownKeys(dynamicModule).filter(key => {
            return key !== `__esModule`;
        });

        if (
            moduleKeys.length === 0 ||
            (moduleKeys.length === 1 &&
                moduleKeys[0] === `default` &&
                dynamicModule.default &&
                typeof dynamicModule.default === `object` &&
                !(dynamicModule.default.prototype || dynamicModule.default.constructor?.name !== `Object`) &&
                Reflect.ownKeys(dynamicModule.default).length === 0)
        ) {
            log.error(
                `No exports found in ${filePath}`,
                `Module at ${filePath} does not contain any exports. Module keys: ${JSON.stringify(Reflect.ownKeys(dynamicModule))}`,
                import.meta.filename,
            );
            return null;
        }

        return dynamicModule;
    } catch (error) {
        log.error(`Failed to execute file at ${filePath}:`, (error as Error).message, import.meta.filename);
        return null;
    }
}

export async function ExecuteFilesByPattern(
    dirPath: string,
    patterns: RegExp[],
    depth: number,
    mode: DepthMode = DepthMode.UpToDepth,
): Promise<any[]> {
    if (!dirPath) {
        throw new Error(`Directory path is required but was not provided`);
    }

    if (!Array.isArray(patterns) || patterns.length === 0) {
        throw new Error(`At least one pattern must be provided`);
    }

    if (typeof depth !== `number` || depth < 0) {
        throw new Error(`Depth must be a non-negative number`);
    }

    try {
        const dirStat = fs.statSync(dirPath);
        if (!dirStat.isDirectory()) {
            throw new Error(`Path ${dirPath} is not a directory`);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === `ENOENT`) {
            throw new Error(`Directory not found: ${dirPath}`);
        }
        throw error;
    }

    const searchOptions: SearchOptions = {
        mode,
        depth,
    };

    const files = await __SearchFiles(dirPath, patterns, searchOptions, 0);
    const exportsArray = await Promise.all(files.map(__ExecuteFile));

    return exportsArray.filter(exported => {
        return exported !== null;
    });
}
