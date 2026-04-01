/**
 * Berget AI Auth Plugin for OpenCode
 *
 * Authenticate OpenCode with your Berget AI account to use
 * AI models through Berget's European AI infrastructure.
 *
 * @example
 * ```json
 * // opencode.json
 * {
 *   "$schema": "https://opencode.ai/config.json",
 *   "plugin": ["@bergetai/opencode-auth@1.0.10"]
 * }
 * ```
 *
 * @see https://berget.ai
 * @see https://opencode.ai/docs/plugins
 */

import { BergetAuthPlugin, BergetOAuthPlugin } from "./src/plugin";

// OpenCode 1.3.x expects plugins to export { server: Plugin }
export const BergetPlugin = {
  server: BergetAuthPlugin,
};

// Default export for OpenCode plugin loader
export default BergetPlugin;

// Named exports for backward compatibility and direct usage
export { BergetAuthPlugin, BergetOAuthPlugin };

// Re-export types for consumers
export type {
  OAuthAuthDetails,
  AuthDetails,
  AuthOAuthResult,
  BergetUser,
} from "./src/plugin/types";

// Re-export utilities that might be useful
export { isOAuthAuth, accessTokenExpired } from "./src/plugin/auth";
export { createPkceAuthorizeMethod } from "./src/plugin/pkce-flow";
