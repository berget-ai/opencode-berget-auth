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
import { fetchBergetModels } from "./plugin/models";
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

      // Ensure Berget provider exists - fetch models dynamically
      if (!config.provider.berget) {
        const models = await fetchBergetModels();
        config.provider.berget = {
          api: BERGET_INFERENCE_URL,
          models,
        };
        logDebug(`Configured Berget with ${Object.keys(models).length} models`);
      }
    },

    // Authentication configuration
    auth: {
      provider: BERGET_PROVIDER_ID,

      // Loader runs once at startup. We return a custom fetch that
      // refreshes the token per-request, since OpenCode caches the
      // apiKey from loader and never calls loader again.
      loader: async (
        getAuth: () => Promise<Auth>,
        _provider: Provider
      ): Promise<Record<string, unknown>> => {
        const auth = await getAuth();

        // API key users don't need custom fetch -- keys don't expire
        if (!isOAuthAuth(auth as OAuthAuthDetails)) {
          return {};
        }

        // Seed the in-memory cache with the stored auth
        const authRecord = auth as OAuthAuthDetails;
        storeCachedAuth(authRecord);

        // Return custom fetch that refreshes the token per-request.
        // OpenCode only calls loader once at startup and caches apiKey,
        // but fetch is called on every API request by @ai-sdk/openai-compatible.
        return {
          apiKey: authRecord.access || "",
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            let current = resolveCachedAuth(authRecord);

            if (accessTokenExpired(current)) {
              logDebug("Token expired, refreshing before request...");
              const refreshed = await refreshAccessTokenDirect(current);
              if (refreshed) {
                current = refreshed;
                storeCachedAuth(refreshed);
                logDebug("Token refreshed successfully");
              } else {
                logError("Token refresh failed");
              }
            }

            const headers = new Headers(init?.headers);
            if (current.access) {
              headers.set("Authorization", `Bearer ${current.access}`);
            }

            return fetch(input, {
              ...init,
              headers,
            });
          },
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
