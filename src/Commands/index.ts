import { ChatInputCommandInteraction } from 'discord.js';
import { resolve, dirname } from 'path';
import { ExecuteFilesAndCollectExports, DepthMode } from '../Execution/Direct/ExecuteFilesAndCollectExports.js';
import { fileURLToPath } from 'url';
import { log } from '../Common/Log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsRoot = resolve(__dirname);

/**
 * Interface representing a bot command with slash command data and an execution handler.
 */
export interface BotCommand {
    /** Slash command builder instance defining this command. */
    data: any;
    /**
     * Execute logic for this command when a ChatInputCommandInteraction is received.
     * @param interaction The interaction triggered by the command.
     */
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface BotCommandsMap {
    [key: string]: BotCommand;
}

const commands: BotCommandsMap = {};

export const commandsReady: Promise<void> = (async () => {
    let modules: any[];
    try {
        // load all commands in root (no subdirectories)
        const rootModules = await ExecuteFilesAndCollectExports(
            commandsRoot,
            [/\.js$/, /\.ts$/],
            0,
            DepthMode.UpToDepth,
        );
        // load only group index files one level down
        const groupModules = await ExecuteFilesAndCollectExports(
            commandsRoot,
            [/index\.js$/, /index\.ts$/],
            1,
            DepthMode.ExactDepth,
        );
        modules = [...rootModules, ...groupModules];
    } catch (err) {
        log.error('Error scanning command files', `[commands/index]`);
        return;
    }
    for (const mod of modules) {
        try {
            // default export class
            if (typeof mod === 'function') {
                try {
                    const inst = new (mod as any)();
                    if (inst.data && typeof inst.execute === 'function') {
                        commands[inst.data.name] = inst;
                        continue;
                    }
                } catch {}
            }
        } catch (err) {
            log.error('Error loading module', `[commands/index]`);
            continue;
        }
        const moduleExports = mod as any;
        // named export data+execute
        if (moduleExports.data && typeof moduleExports.execute === 'function') {
            commands[moduleExports.data.name] = { data: moduleExports.data, execute: moduleExports.execute };
            continue;
        }
        // other named exports as classes
        for (const Ex of Object.values(moduleExports)) {
            if (typeof Ex === 'function') {
                try {
                    const inst = new (Ex as any)();
                    if (inst.data && typeof inst.execute === 'function') {
                        commands[inst.data.name] = inst;
                    }
                } catch {}
            }
        }
    }
})();

export { commands };
