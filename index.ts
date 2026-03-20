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
 *   "plugin": ["opencode-berget-auth@latest"]
 * }
 * ```
 *
 * @see https://berget.ai
 * @see https://opencode.ai/docs/plugins
 */

export { BergetAuthPlugin, BergetOAuthPlugin } from "./src/plugin";
export { BergetAuthPlugin as default } from "./src/plugin";

// Re-export types for consumers
export type {
  OAuthAuthDetails,
  AuthDetails,
  AuthOAuthResult,
  DeviceAuthResponse,
  DeviceTokenResponse,
  BergetUser,
} from "./src/plugin/types";

// Re-export utilities that might be useful
export { isOAuthAuth, accessTokenExpired } from "./src/plugin/auth";
export { initiateDeviceFlow, pollForToken } from "./src/plugin/device-flow";
