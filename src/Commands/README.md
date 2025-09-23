# Command Loader Guide

This document explains how to add new commands and subcommands in the bot, leveraging the existing loader implementations in `src/commands/index.ts` and the dynamic grouping under `src/commands/object/`.

---

## Top-Level Commands

The main loader in `src/commands/index.ts` discovers files and classes under the `commands` directory. Each module must export either:

1. A default-exported class with `data` and `execute` properties:

    ```ts
    export default class MyCommand {
        public data = new SlashCommandBuilder().setName('mycmd').setDescription('My test command');

        public async execute(interaction: ChatInputCommandInteraction) {
            // command logic
        }
    }
    ```

2. Named exports `data` and `execute`:

    ```ts
    export const data = new SlashCommandBuilder().setName('greet').setDescription('Send a greeting');

    export async function execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply('Hello!');
    }
    ```

When the bot starts, the loader runs `ExecuteFilesAndCollectExports` over `src/commands`. It builds a map `{ [commandName]: BotCommand }` and exposes:

- `commandsReady`: Promise that resolves after loading
- `commands`: object mapping command names to handlers

In your application code (e.g. `src/app.ts`), use:

```ts
await commandsReady;
const payload = Object.values(commands).map(cmd => cmd.data.toJSON());
await client.application!.commands.set(payload);

client.on('interactionCreate', interaction => {
    if (!interaction.isChatInputCommand()) return;
    const handler = commands[interaction.commandName];
    if (handler) handler.execute(interaction);
});
```

---

## Grouped Subcommands: `object` Command

The `object` command uses a custom loader in `src/commands/object/index.ts`. It builds a root `/object` command with subcommand groups and subcommands based on directory structure:

```
src/commands/object/
├─ create.ts       # becomes subcommand object.create
├─ update.ts
└─ detail.ts
```

Further nested groups live in subfolders:

```
src/commands/object/user/
  ├─ create.ts    # object user.create
  └─ delete.ts
```

### How it works

1. The root `data` is built with `.setName('object')` and `.setDescription(...)`.
2. For each subfolder under `object/`, a subcommand group is added:
    ```ts
    data.addSubcommandGroup(group => {
        group.setName('user').setDescription('Manage user');
        group.addSubcommand(sub => subData);
        return group;
    });
    ```
3. Handlers are registered in a `handlers: Record<string, Handler>` map, keyed as `groupName.subName`.
4. The exported `execute` function reads `interaction.options.getSubcommandGroup()` and `.getSubcommand()` to dispatch:
    ```ts
    const key = `${group}.${sub}`;
    if (handlers[key]) await handlers[key](interaction);
    ```

### Adding a new subcommand group

1. Create a new folder under `src/commands/object/`, e.g. `stats`:
2. Add JS/TS files exporting `data: SlashCommandSubcommandBuilder` and `execute`:

    ```ts
    export const data = new SlashCommandSubcommandBuilder().setName('report').setDescription('Show stats report');

    export async function execute(interaction: ChatInputCommandInteraction) {
        // logic
    }
    ```

3. Restart or rebuild; the loader picks up new modules automatically.

---

## Interactive Creation Flows with FlowBuilder

The bot uses a fluent API for guided, multi-step commands. The `flowManager.builder(...)` method returns a `FlowBuilder` to define each step:

```ts
import { flowManager } from './src/flow/FlowManager';

await flowManager
    .builder(userId, interaction, { serverId })
    .step('step_custom_id')
    .prompt(async ctx => {
        // send modal or message to prompt user
    })
    .onInteraction(async (ctx, interaction) => {
        // handle button or modal submit
        return true; // advance to next
    })
    .next()
    .step()
    .prompt(async ctx => {
        // ask for text or attachment
    })
    .onMessage(async (ctx, message) => {
        // process message, e.g. image upload or skip
        return true; // advance
    })
    .next()
    .step()
    .prompt(async ctx => {
        // finalize creation, call flow logic
    })
    .next()
    .start();
```

FlowBuilder methods:

- `step(customId?)`: begin a new flow step, optional interaction custom ID
- `prompt(fn)`: send a prompt via interaction or message
- `onInteraction(fn)`: handle an interaction (button/modal)
- `onMessage(fn)`: handle a user message (text or attachment)
- `next()`: finalize current step
- `start()`: launch the flow sequence
