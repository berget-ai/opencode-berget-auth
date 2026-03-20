/**
 * Berget AI Auth Plugin for OpenCode
 *
 * Enables authentication with Berget AI using Keycloak OAuth
 * via the Device Authorization Flow (RFC 8628).
 *
 * Usage:
 * 1. Add to opencode.json: { "plugin": ["opencode-berget-auth@latest"] }
 * 2. Run: opencode auth login
 * 3. Select "Berget" provider
 * 4. Complete authentication in browser
 */

import type { Auth, Provider, Config } from "@opencode-ai/sdk";
import { BERGET_PROVIDER_ID, BERGET_INFERENCE_URL } from "./constants";
import { isOAuthAuth, accessTokenExpired } from "./plugin/auth";
import { resolveCachedAuth, storeCachedAuth } from "./plugin/cache";
import { logDebug, logError } from "./plugin/debug";
import { createDeviceFlowAuthorizeMethod } from "./plugin/device-flow";
import { refreshAccessTokenDirect } from "./plugin/token";
import type { PluginInput, Hooks, OAuthAuthDetails } from "./plugin/types";

/**
 * Main plugin export - Berget OAuth Plugin for OpenCode
 *
 * This plugin:
 * 1. Registers "berget" as an auth provider in OpenCode
 * 2. Implements Device Authorization Flow for CLI authentication
 * 3. Provides custom fetch with automatic token refresh
 * 4. Handles token refresh automatically
 */
export const BergetAuthPlugin = async ({
  client,
}: PluginInput): Promise<Hooks> => {
  logDebug("Initializing Berget Auth Plugin");

  return {
    // Configure OpenCode with Berget-specific settings
    config: async (config: Config) => {
      logDebug("Configuring OpenCode for Berget");

      // Add Berget provider configuration if not present
      if (!config.provider) {
        config.provider = {};
      }

      // Ensure Berget provider exists with default models
      if (!config.provider.berget) {
        config.provider.berget = {
          api: BERGET_INFERENCE_URL,
          models: {
            // Default models available on Berget
            "anthropic/claude-sonnet-4-20250514": {},
            "anthropic/claude-opus-4-20250514": {},
            "openai/gpt-4o": {},
            "openai/gpt-4o-mini": {},
            "google/gemini-2.5-pro-preview-06-05": {},
            "google/gemini-2.5-flash-preview-05-20": {},
            "mistral/mistral-large-latest": {},
            "deepseek/deepseek-chat": {},
            "deepseek/deepseek-reasoner": {},
          },
        };
      }
    },

    // Authentication configuration
    auth: {
      provider: BERGET_PROVIDER_ID,

      // Loader is called when making API requests to validate/prepare auth
      loader: async (
        getAuth: () => Promise<Auth>,
        _provider: Provider
      ): Promise<Record<string, unknown>> => {
        const auth = await getAuth();

        // Only handle OAuth auth (not API keys)
        if (!isOAuthAuth(auth as OAuthAuthDetails)) {
          logDebug("Non-OAuth auth detected, returning empty loader result");
          return {};
        }

        logDebug("OAuth auth detected, setting up auth loader");

        // Resolve cached auth (may have fresher tokens)
        let authRecord = resolveCachedAuth(auth as OAuthAuthDetails);

        // Refresh token if expired
        if (accessTokenExpired(authRecord)) {
          logDebug("Access token expired, refreshing");
          const refreshed = await refreshAccessTokenDirect(authRecord);

          if (!refreshed) {
            logError("Failed to refresh token");
            return {};
          }

          authRecord = refreshed;
          storeCachedAuth(authRecord);
        }

        // Return the access token for the provider to use
        return {
          apiKey: authRecord.access || "",
          // Custom fetch could be added here if needed
        };
      },

      // Authentication methods available to users
      methods: [
        {
          type: "oauth" as const,
          label: "Login with Berget (Device Flow)",
          authorize: createDeviceFlowAuthorizeMethod(),
        },
        {
          type: "api" as const,
          label: "Enter Berget API Key manually",
        },
      ],
    },
  };
};

// Export aliases for flexibility
export const BergetOAuthPlugin = BergetAuthPlugin;
export default BergetAuthPlugin;
