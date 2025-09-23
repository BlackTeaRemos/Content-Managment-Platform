import path from 'path';
import * as fs from 'fs';
import { log } from '../../Common/Log.js';

export async function ExecuteFilesInSubdirectories(dirPath: string) {
    try {
        const subdirectories = fs.readdirSync(dirPath).filter(file => {
            const filePath = path.join(dirPath, file);
            return fs.statSync(filePath).isDirectory();
        });

        for (const subdirectory of subdirectories) {
            const subDirPath = path.join(dirPath, subdirectory);
            const files = fs.readdirSync(subDirPath).filter(file => {
                const filePath = path.join(subDirPath, file);
                return fs.statSync(filePath).isFile();
            });

            for (const file of files) {
                const filePath = path.join(subDirPath, file);
                try {
                    const dynamicModule = (await import(`file://${filePath}`)).default;

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
                            !(
                                dynamicModule.default.prototype || dynamicModule.default.constructor?.name !== `Object`
                            ) &&
                            Reflect.ownKeys(dynamicModule.default).length === 0)
                    ) {
                        log.error(
                            `No exports found in ${filePath}`,
                            `Module at ${filePath} does not contain any exports. Module keys: ${JSON.stringify(Reflect.ownKeys(dynamicModule))}`,
                            import.meta.filename,
                        );
                        continue;
                    }

                    log.debug(`File at ${filePath} executed successfully`, import.meta.filename);
                } catch (error) {
                    log.error(`Failed to execute file at ${filePath}:`, (error as Error).message, import.meta.filename);
                }
            }
        }
    } catch (error) {
        log.error(`Error while executing files in subdirectories:`, (error as Error).message, import.meta.filename);
    }
}
