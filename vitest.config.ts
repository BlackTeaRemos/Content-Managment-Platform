import { defineConfig } from 'vitest/config';
import path from 'node:path';

const ROOT = process.cwd();

export default defineConfig({
    root: ROOT,
    resolve: {
        preserveSymlinks: true,
    },
    server: {
        fs: {
            strict: false,
            allow: [ROOT],
        },
    },
    test: {
        root: ROOT,
        dir: path.resolve(ROOT, 'test'),
        include: ['**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/cmp/**'],
        watch: false,
        reporters: 'default',
        environment: 'node',
        pool: 'forks', // avoid worker_threads path quirks on Windows
        setupFiles: [path.resolve(ROOT, 'test/setup/tests.setup.ts')],
    },
});
