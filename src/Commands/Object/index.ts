import { SlashCommandBuilder, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';
import { readdirSync, lstatSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { log } from '../../Common/Log.js';

// Removed createRequire; using dynamic import for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Handler = (interaction: ChatInputCommandInteraction) => Promise<void>;
const handlers: Record<string, Handler> = {};

/** Root command for 'object' with dynamic subcommand groups */
export const data = new SlashCommandBuilder().setName('object').setDescription('Manage graph objects');
// Dynamically load and attach subcommand groups for each object type
await (async () => {
    try {
        // Identify group directories under commands/object
        const groups = readdirSync(__dirname).filter(name => {
            const fullPath = path.join(__dirname, name);
            return lstatSync(fullPath).isDirectory();
        });
        for (const groupName of groups) {
            const groupPath = path.join(__dirname, groupName);
            // Load all subcommand modules in group directory
            const files = readdirSync(groupPath).filter(
                file => path.extname(file) === '.js' && !file.startsWith('index'),
            );
            const mods = await Promise.all(files.map(file => import(pathToFileURL(path.join(groupPath, file)).href)));
            // Register subcommands
            data.addSubcommandGroup(group => {
                group.setName(groupName).setDescription(`Manage ${groupName}`);
                for (const mod of mods) {
                    const subData: SlashCommandSubcommandBuilder = (mod as any).data;
                    if (subData && typeof subData.name === 'string') {
                        group.addSubcommand(() => subData);
                        handlers[`${groupName}.${subData.name}`] = (mod as any).execute;
                    }
                }
                return group;
            });
        }
    } catch (err) {
        log.error('Error initializing object command groups', (err as Error).message, 'ObjectCommand');
    }
})();

/** Dispatch to the appropriate handler based on group and subcommand */
export async function execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(true);
    const key = `${group}.${sub}`;
    const handler = handlers[key];

    if (handler) {
        await handler(interaction);
    }
}
