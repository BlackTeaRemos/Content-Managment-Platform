# Execution Context Feature

This document describes the execution context feature implemented to avoid unnecessary recomputation and provide shared state across command execution flows.

## Overview

Each command in `src/commands` can now access an execution context that provides:

1. **Caching/Memorization** - Avoid recomputing expensive operations
2. **Shared State** - Pass data between different parts of the execution flow
3. **Tracing** - Correlation IDs for debugging and monitoring

## Core Interfaces

### ExecutionContext

```typescript
interface ExecutionContext {
    correlationId: string; // For tracing requests
    cache: Map<string, any>; // For caching computed values
    shared: Record<string, any>; // For custom shared state
    createdAt: Date; // When context was created
    getOrCompute<T>(key: string, computeFn: () => Promise<T> | T): Promise<T>;
    has(key: string): boolean; // Check if cached
    set(key: string, value: any): void; // Set cached value
    clear(): void; // Clear all cache
    getStats?(): { size: number; keys: string[]; createdAt: Date; correlationId: string };
}
```

## Usage Examples

### 1. Simple Command with Caching

```typescript
import { createCommandContext } from '../../../Common/ExecutionContextHelpers.js';

export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    // Expensive operation cached for subsequent calls
    const userData = await ctx.executionContext!.getOrCompute(`user:${ctx.userId}`, async () => {
        return await database.getUser(ctx.userId); // Only called once
    });

    await ctx.reply(`Hello ${userData.username}!`);
}
```

### 2. Flow-based Command with Context

```typescript
import { executeWithContext } from '../../../Common/ExecutionContextHelpers.js';

export async function execute(interaction: ChatInputCommandInteraction) {
    await executeWithContext(interaction, async (flowManager, executionContext) => {
        await flowManager
            .builder(interaction.user.id, interaction, {}, executionContext)
            .step('step1')
            .prompt(async ctx => {
                // Cache expensive data in step 1
                const data = await ctx.executionContext?.getOrCompute('key', computeData);
                // ... use data
            })
            .next()
            .step('step2')
            .prompt(async ctx => {
                // Reuse cached data in step 2 (no recomputation)
                const data = await ctx.executionContext?.getOrCompute('key', computeData);
                // ... use data
            })
            .next()
            .start();
    });
}
```

### 3. Shared State Across Execution

```typescript
export async function execute(interaction: ChatInputCommandInteraction) {
    const ctx = createCommandContext(interaction);

    // Set shared state early in execution
    ctx.executionContext!.shared.startTime = Date.now();
    ctx.executionContext!.shared.userPrefs = await getUserPreferences(ctx.userId);

    // Later in execution, access shared state
    const duration = Date.now() - ctx.executionContext!.shared.startTime;
    const prefs = ctx.executionContext!.shared.userPrefs;
}
```

## Integration Points

### CommandRegistry

The `CommandRegistry.Execute()` method automatically creates an `ExecutionContext` if one is not provided, ensuring all CommandModule-based commands have access to execution context.

The `CommandRegistry.Execute()` method also enforces permission checks before executing a command. It resolves static permission token templates exported by command modules (strings or arrays) and evaluates them using the centralized permission manager. If a permission evaluation requires interactive admin approval, programmatic execution will be denied with a clear error result (interactive approval flows are only available for Discord interactions).

Notes:

- Commands may export `permissionTokens` as a string, array, or async function. When a function is exported it is intended for use with Discord interactions and will not be executed in programmatic contexts. For programmatic calls prefer static templates (string or array) so tokens can be resolved by `CommandRegistry.Execute()`.

### FlowManager

The `FlowManager` and `FlowBuilder` have been extended to accept and pass execution context through all flow steps:

- `flowManager.builder(userId, interaction, state, executionContext?)`
- All `StepContext` objects include `executionContext?: ExecutionContext`

## Demo Commands

Two demo commands are included:

1. **`/object diagnostic context-demo`** - Shows basic caching and shared state
2. **`/object diagnostic flow-demo`** - Shows execution context with interactive flows
