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
 *   "plugin": ["@bergetai/opencode-auth@latest"]
 * }
 * ```
 *
 * @see https://berget.ai
 * @see https://opencode.ai/docs/plugins
 */

import { BergetAuthPlugin, BergetOAuthPlugin } from "./src/plugin";

// Export the plugin function directly as default (OpenCode loads default export)
export default BergetAuthPlugin;

// Also export as PluginModule format for compatibility
export const server = BergetAuthPlugin;

// Named exports for backward compatibility
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
