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

import type { Auth, Config, Provider } from '@opencode-ai/sdk';

import type { Hooks, OAuthAuthDetails, PluginInput } from './plugin/types';

import { BERGET_PROVIDER_ID, getInferenceUrl } from './constants';
import { accessTokenExpired, isOAuthAuth } from './plugin/auth';
import { logDebug, logError } from './plugin/debug';
import { fetchBergetModels } from './plugin/models';
import { createPkceAuthorizeMethod } from './plugin/pkce-flow';
import { refreshAccessTokenDirect } from './plugin/token';

type FetchInput = Request | string | URL;

/**
 * Wraps a native fetch call while preserving headers from both Request
 * objects and init, then injecting (or overwriting) Authorization.
 */
async function fetchWithAuth(
  authToken: string,
  input: FetchInput,
  init?: RequestInit,
): Promise<Response> {
  const request =
    input instanceof Request ? new Request(input, init) : new Request(input.toString(), init);

  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${authToken}`);
  return fetch(request, { headers });
}

/**
 * Main plugin export - Berget OAuth Plugin for OpenCode
 *
 * This plugin:
 * 1. Registers "berget" as an auth provider in OpenCode
 * 2. Implements PKCE flow for browser-based authentication
 * 3. Provides custom fetch with automatic token refresh
 * 4. Handles token refresh automatically
 */
export const BergetAuthPlugin = async ({ client }: PluginInput): Promise<Hooks> => {
  logDebug('Initializing Berget Auth Plugin');

  return {
    // Authentication configuration
    auth: {
      // Loader runs once at startup. We return a custom fetch that
      // refreshes the token per-request, since OpenCode caches the
      // apiKey from loader and never calls loader again.
      loader: async (
        getAuth: () => Promise<Auth>,
        _provider: Provider,
      ): Promise<Record<string, unknown>> => {
        const auth = await getAuth();

        // API key users: use custom fetch to inject Bearer token
        if (!isOAuthAuth(auth as OAuthAuthDetails)) {
          const apiAuth = auth as { key?: string; type: string };
          if (apiAuth.key) {
            const apiKey = apiAuth.key;
            return {
              apiKey,
              fetch: async (input: Request | string | URL, init?: RequestInit): Promise<Response> =>
                fetchWithAuth(apiKey, input, init),
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
          apiKey: currentAuth.access || '',
          fetch: async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
            if (accessTokenExpired(currentAuth)) {
              // Cache-busting: another process may have refreshed and persisted
              // a fresher token. Ask the framework for the latest auth before
              // initiating an HTTP refresh.
              logDebug('Token expired, checking disk for fresher token...');
              try {
                const diskAuth = await getAuth();
                if (isOAuthAuth(diskAuth as OAuthAuthDetails)) {
                  const diskOAuth = diskAuth as OAuthAuthDetails;
                  if (!accessTokenExpired(diskOAuth)) {
                    currentAuth = diskOAuth;
                    logDebug('Adopted fresher token from disk, skipping HTTP refresh');
                    return fetchWithAuth(currentAuth.access || '', input, init);
                  }
                  logDebug('Disk token is also expired, proceeding with HTTP refresh');
                }
              } catch (error) {
                logDebug(
                  `getAuth() failed during cache-busting check: ${error instanceof Error ? error.message : String(error)}`,
                );
              }

              logDebug('Token expired, refreshing before request...');
              const result = await refreshAccessTokenDirect(currentAuth, client, getAuth);
              if (result.success) {
                currentAuth = result.auth;
                logDebug('Token refreshed successfully');
              } else {
                logError('Token refresh failed', result.reason);
                throw new Error(`Token refresh failed: ${result.reason}`);
              }
            }

            return fetchWithAuth(currentAuth.access || '', input, init);
          },
        };
      },

      // Authentication methods available to users
      methods: [
        {
          authorize: createPkceAuthorizeMethod(),
          label: 'Use Berget Code plan',
          type: 'oauth' as const,
        },
        {
          label: 'Use Berget AI API key',
          type: 'api' as const,
        },
      ],

      provider: BERGET_PROVIDER_ID,
    },

    // Configure OpenCode with Berget-specific settings
    config: async (config: Config): Promise<void> => {
      logDebug('Configuring OpenCode for Berget');

      // Always set the API URL and models from env var (allows runtime override)
      // We always fetch models dynamically to override any stale models in the binary
      config.provider ??= {};
      config.provider.berget ??= { api: '', models: {}, options: {} };

      const inferenceUrl = getInferenceUrl();
      config.provider.berget.api = inferenceUrl;
      config.provider.berget.options ??= {};
      config.provider.berget.options.baseURL = inferenceUrl;
      config.provider.berget.models = await fetchBergetModels();
      logDebug(
        `Berget provider configured: ${inferenceUrl}, ${Object.keys(config.provider.berget.models).length} models`,
      );
    },
  };
};

// Export aliases for flexibility
export const BergetOAuthPlugin = BergetAuthPlugin;
export default BergetAuthPlugin;
