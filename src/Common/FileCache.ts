/**
 * Generic file-based cache for temporary storage and retrieval of data.
 * Not tied to Discord or any application logic. Use for any local file caching needs.
 */
import { promises as fs } from 'fs';
import path from 'path';

/**
 * FileCache manages temporary local storage for file data.
 * Main storage is always external; this is for performance only.
 */
export class FileCache {
    /** Directory for cache files [// absolute path] */
    private _cacheDir: string;

    /**
     * @param cacheDir string - Directory to store cache files (e.g. '/tmp/cache')
     */
    constructor(cacheDir: string) {
        this._cacheDir = cacheDir;
    }

    /**
     * Writes file data to cache.
     * @param fileId string - Unique file ID
     * @param data Buffer - File data
     * @returns Promise<void>
     * @example
     * await fileCache.write('abc123', Buffer.from('data'));
     */
    async write(fileId: string, data: Buffer): Promise<void> {
        const filePath = this._getPath(fileId);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, data);
    }

    /**
     * Reads file data from cache.
     * @param fileId string - Unique file ID
     * @returns Promise<Buffer | null> - File data or null if not found
     * @example
     * const data = await fileCache.read('abc123');
     */
    async read(fileId: string): Promise<Buffer | null> {
        const filePath = this._getPath(fileId);

        try {
            return await fs.readFile(filePath);
        } catch {
            return null;
        }
    }

    /**
     * Removes file from cache.
     * @param fileId string - Unique file ID
     * @returns Promise<void>
     * @example
     * await fileCache.remove('abc123');
     */
    async remove(fileId: string): Promise<void> {
        const filePath = this._getPath(fileId);

        try {
            await fs.unlink(filePath);
        } catch {
            // Ignore if not found
        }
    }

    /**
     * Gets the cache file path for a file ID.
     * @param fileId string
     * @returns string
     * @example
     * const path = fileCache._getPath('abc123');
     */
    private _getPath(fileId: string): string {
        // Use subdirectories for scalability
        return path.join(this._cacheDir, fileId.slice(0, 2), fileId);
    }
}
