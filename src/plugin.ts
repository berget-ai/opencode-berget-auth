/**
 * Berget AI Auth Plugin for OpenCode
 *
 * Enables authentication with Berget AI using Keycloak OAuth.
 * Uses PKCE flow (RFC 7636) for browser-based authentication.
 *
 * Usage:
 * 1. Add to opencode.json: { "plugin": ["opencode-berget-auth@latest"] }
 * 2. Run: opencode auth login
 * 3. Select "Berget" provider
 * 4. Complete authentication in browser
 */

import type { Auth, Provider, Config } from "@opencode-ai/sdk";
import { BERGET_PROVIDER_ID, getInferenceUrl } from "./constants";
import { isOAuthAuth, accessTokenExpired } from "./plugin/auth";
import { logDebug, logError } from "./plugin/debug";
import { createPkceAuthorizeMethod } from "./plugin/pkce-flow";
import { fetchBergetModels } from "./plugin/models";
import { refreshAccessTokenDirect } from "./plugin/token";
import type { PluginInput, Hooks, OAuthAuthDetails } from "./plugin/types";

/**
 * Main plugin export - Berget OAuth Plugin for OpenCode
 *
 * This plugin:
 * 1. Registers "berget" as an auth provider in OpenCode
 * 2. Implements PKCE flow for browser-based authentication
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

      // Always set the API URL and models from env var (allows runtime override)
      // We always fetch models dynamically to override any stale models in the binary
      const inferenceUrl = getInferenceUrl();
      const models = await fetchBergetModels();
      
      if (!config.provider.berget) {
        config.provider.berget = {
          api: inferenceUrl,
          options: { baseURL: inferenceUrl },
          models,
        };
      } else {
        // Override API URL and models even if provider exists (from binary/cache)
        config.provider.berget.api = inferenceUrl;
        config.provider.berget.models = models;
        if (!config.provider.berget.options) {
          config.provider.berget.options = {};
        }
        config.provider.berget.options.baseURL = inferenceUrl;
      }
      logDebug(`Berget provider configured: ${inferenceUrl}, ${Object.keys(models).length} models`);
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

        // API key users: use custom fetch to inject Bearer token
        if (!isOAuthAuth(auth as OAuthAuthDetails)) {
          const apiAuth = auth as { type: string; key?: string };
          if (apiAuth.key) {
            const apiKey = apiAuth.key;
            return {
              apiKey,
              fetch: async (input: string | URL | Request, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                headers.set("Authorization", `Bearer ${apiKey}`);
                return fetch(input, { ...init, headers });
              },
            };
          }
          return {};
        }

        // Mutable reference to current auth state, shared between all requests.
        // Updated in-place after each refresh so subsequent requests see the fresh token.
        let currentAuth = auth as OAuthAuthDetails;

        // Return custom fetch that refreshes the token per-request.
        // OpenCode only calls loader once at startup and caches apiKey,
        // but fetch is called on every API request by @ai-sdk/openai-compatible.
        return {
          apiKey: currentAuth.access || "",
          fetch: async (input: string | URL | Request, init?: RequestInit) => {
            if (accessTokenExpired(currentAuth)) {
              logDebug("Token expired, refreshing before request...");
              const refreshed = await refreshAccessTokenDirect(currentAuth);
              if (refreshed) {
                currentAuth = refreshed;
                logDebug("Token refreshed successfully");
              } else {
                logError("Token refresh failed");
              }
            }

            const headers = new Headers(init?.headers);
            if (currentAuth.access) {
              headers.set("Authorization", `Bearer ${currentAuth.access}`);
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
          label: "Login with Berget",
          authorize: createPkceAuthorizeMethod(),
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
