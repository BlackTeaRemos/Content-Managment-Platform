# Flow Authoring Guide

Flows capture the reusable logic that powers command interactions. Use this folder to keep commands thin and to centralize complicated behaviour such as permission resolution, data fetching, or multi-step orchestration helpers.

## Folder Layout

- `Command/` contains helpers dedicated to command modules. Each command family (view, game-create, etc.) exposes functions that commands call to resolve permissions or trigger domain actions.
- `Object/` holds object-specific flow logic (create, upload, view, etc.).
- `permission/` centralizes shared permission UI components and utilities.
- `FlowManager.ts` exposes the builder used by command modules to describe interaction steps.

Keep helpers close to the command or domain they serve. Prefer composition over inheritance: each helper file should export plain functions that operate on the interaction and context objects.

## Writing a Command Flow Helper

1. Pick or create a file under `src/Flow/Command`. Name it after the command family, for example `FooFlow.ts`.
2. Export a context interface describing the values the helper expects.
3. Export a result interface capturing the decision (allowed, reason, tokens, admin decision, etc.).
4. Export an async function that accepts the interaction and context, performs whatever logic is needed (permission resolution, data lookups), and returns the standardized result.
5. Keep any interaction-specific side effects (deferReply, followUp) inside the helper so commands stay declarative.

Example skeleton:

```ts
import type { ChatInputCommandInteraction } from 'discord.js';
import { resolve } from '../../Common/permission/index.js';

export interface FooContext {
    serverId: string;
}

export interface FooResult {
    allowed: boolean;
    reason?: string;
}

export async function resolveFooPermissions(
    interaction: ChatInputCommandInteraction,
    context: FooContext,
): Promise<FooResult> {
    const outcome = await resolve.ensure(['foo:{serverId}'], { context: { ...context, userId: interaction.user.id } });
    return { allowed: outcome.success, reason: outcome.detail.reason };
}
```

Commands import `resolveFooPermissions` and call it at the appropriate step.

## Using FlowManager Builder

`FlowManager` exposes `builder(userId, interaction, initialState, executionContext)` which returns a fluent API to construct steps.

Key concepts:

- `step(customId?)` starts a new stage. Provide a custom ID when you need to identify modal submissions or button interactions.
- `prompt(handler)` sends the initial UI for the step (modal, reply, DM, etc.).
- `onInteraction(handler)` handles component responses.
- `onMessage(handler)` handles raw user messages.
- `next()` finalizes the current stage and moves to the next.
- `start()` kicks off the configured pipeline.

Each handler receives a context object with:

- `state`: mutable object persisted across steps. Define its shape in the command file to keep TypeScript aware of available properties.
- `interaction`: the command interaction or the most recent interaction affecting the flow.
- `executionContext`: domain-specific metadata shared across flows (Neo4j session, caches, etc.).

## Standardizing Permission Requests

When a flow needs permission checks, follow the pattern used in `ViewFlow.ts` and `GameCreateFlow.ts`:

1. Resolve token templates through `resolve.ensure` with a fully populated context (guild id, user id, domain identifiers).
2. Fetch the guild member up front to reuse permission cache logic.
3. Request admin approval with `requestPermissionFromAdmin` (interactive helper lives under `src/SubCommand/Permission`) when `resolve.ensure` indicates approval is required.
4. Persist forever approvals via `grantForever` when admins choose that option.
5. Log every step with `log.info`/`log.warning` so production diagnostics capture the flow.

Commands should never duplicate the above sequence. Instead, they import a helper that performs these steps and returns a concise result.

## Testing and Iteration

- Keep helpers pure whenever possible. If an operation depends on Discord state, abstract it behind injectable functions to make unit testing feasible.
- When adding new flows or helpers, update this README with the pattern you followed so future contributors can repeat it.
- Run `npx vitest run --config vitest.config.ts` or the provided build tasks after modifying flow helpers to ensure type safety and test coverage remain intact.
