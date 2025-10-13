# Command Authoring Guide

This document explains how runtime command modules are structured and how to add new behaviour without duplicating permission or flow logic.

## Command Module Shape

Every file under `src/Commands/**` exports the pair `data` and `execute`.

```ts
export const data = new SlashCommandBuilder().setName('view').setDescription('Interactive view of stored objects');

export async function execute(interaction: ChatInputCommandInteraction) {
    // step orchestration lives here
}
```

The command loader in `src/Commands/index.ts` imports every file automatically. Avoid side effects in module scope because everything is evaluated eagerly when the loader runs.

### Keep Commands Thin

Command modules own the interaction wiring only:

- build slash metadata via `data`
- orchestrate the flow builder steps inside `execute`
- call into flow helpers (for example `resolveViewPermissions`) to perform domain logic such as permission resolution

All expensive or reusable behaviour belongs in `src/Flow/**`.

## Adding a New Command

1. Create a new TypeScript file under the appropriate folder, for example `src/Commands/Foo.ts` or `src/Commands/Object/Bar/Baz.ts`.
2. Export `data` and `execute` as shown earlier. Use `SlashCommandSubcommandBuilder` for subcommands.
3. Define a flow state interface to capture transient data between steps.
4. Use `flowManager.builder(...)` to configure the interactive sequence. Keep each step small and use helper utilities instead of inlining heavy code.
5. For permissions, call the flow helper dedicated to your command subtype.

```ts
const permission = await resolveFooPermissions(interaction, { contextValue });
if (!permission.allowed) {
    await interaction.followUp({ content: permission.reason ?? 'Denied', flags: MessageFlags.Ephemeral });
    return;
}
```

Publish the command by restarting the bot or re-running the loader pipeline. The registration layer collects the new `data` definitions automatically.

## Object Command Hierarchy

Nested folders inside `src/Commands/Object` map to `/object` subcommand groups. The loader determines the slash command route based on folder depth.

- `src/Commands/Object/View.ts` → `/object view`
- `src/Commands/Object/Game/Create.ts` → `/object game create`

Each subcommand module follows the same rules: thin orchestration, call into the corresponding flow helper in `src/Flow/Command`.

## Flow Builder Primer

Commands rely on `flowManager.builder(userId, interaction, initialState, executionContext)` to orchestrate conversations. The builder exposes:

- `step(customId?)`: start a new stage
- `prompt(handler)`: send UI to the user
- `onInteraction(handler)` / `onMessage(handler)`: capture responses
- `next()`: advance to the next stage
- `start()`: launch the configured flow

State is passed through `ctx.state`, giving you the place to collect form values, attachments, or IDs for subsequent steps. Delegating domain work to flow helpers keeps the command file concerned only with control flow.

## Permission Helpers Per Command

Every command family owns a helper in `src/Flow/Command/*Flow.ts`. These helpers:

- resolve permission templates against context
- fetch guild members when required
- trigger admin approval and handle forever grants
- centralize logging for observability

When implementing a new command, add a new helper alongside the existing ones and call it from the command module. This keeps permission logic consistent and discoverable.
