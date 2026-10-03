/**
 * OpenCode V2 plugin setup.
 *
 * Phase 2/3 wire the integration (auth methods) and provider (models)
 * transforms here; this stub only establishes the lazily-imported module so
 * the dual entrypoint in `index.ts` is complete end to end.
 *
 * SDK note: all imports of `@opencode/plugin` in `src/v2/` must be type-only —
 * the package ships as a devDependency and never executes at runtime
 * (enforced by `index.test.ts`).
 */

import type { Plugin } from '@opencode/plugin';

export async function setupBergetAuth(_context: Plugin.Context): Promise<void> {
  // Integration + provider registration lands in phases 2 and 3.
}
