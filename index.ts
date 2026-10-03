/**
 * Berget AI Auth Plugin for OpenCode — dual V1/V2 entrypoint
 *
 * The default export is the officially recommended dual shape
 * (see https://opencode.ai/v2/docs/build/plugins/migrate-v1):
 *
 * - **V2 CLIs** read `id` and `setup()`, ignoring `server()`. `setup()` is
 *   lazy: the V2 implementation (and its `@opencode/plugin` /
 *   `@opencode/schema` type imports) only loads when a V2 CLI calls it, so no
 *   V2 SDK code ever executes under V1.
 * - **V1 CLIs (>= 1.3.4)** detect the object form and call `server(input)`
 *   with the same `PluginInput` the previous default export received. The V1
 *   implementation is unchanged.
 *
 * `define` mirrors `Plugin.define`, which is the identity function; the local
 * alias keeps any runtime import of the V2 SDK out of the module V1 loads.
 * All `src/v2/` imports of the SDK are type-only (enforced by a unit test).
 *
 * V1 CLIs older than 1.3.4 cannot load object-form default exports — users on
 * those versions must pin `@bergetai/opencode-auth@1.1.1` (the last release
 * without the dual export; `@1` now resolves to the 1.2.x line).
 *
 * @example
 * ```json
 * // opencode.json (V1 CLI)
 * { "plugin": ["@bergetai/opencode-auth@latest"] }
 * // opencode.json (V2 CLI)
 * { "plugins": ["@bergetai/opencode-auth@latest"] }
 * ```
 *
 * @see https://berget.ai
 * @see https://opencode.ai/v2/docs/build/plugins
 */

import type { Plugin } from '@opencode/plugin';

import type { PluginInput } from './src/plugin/types';

import { BergetAuthPlugin } from './src/plugin';

const define = (plugin: Plugin.Plugin): Plugin.Plugin => plugin;

// V2-only code loads lazily so V1's module graph stays byte-for-byte what it
// is today (plus a plain object literal).
export default {
  ...define({
    id: 'berget.auth',
    async setup(context) {
      const { setupBergetAuth } = await import('./src/v2/setup');
      return setupBergetAuth(context);
    },
  }),
  async server(input: PluginInput) {
    return BergetAuthPlugin(input);
  },
};

// Named exports (public API, unchanged)
export { BergetAuthPlugin, BergetOAuthPlugin } from './src/plugin';

export { accessTokenExpired, isOAuthAuth } from './src/plugin/auth';

export { createPkceAuthorizeMethod } from './src/plugin/pkce-flow';
// Re-export types for consumers
export type {
  AuthDetails,
  AuthOAuthResult,
  BergetUser,
  OAuthAuthDetails,
} from './src/plugin/types';
