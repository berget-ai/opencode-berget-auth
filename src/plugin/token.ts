/**
 * Token refresh logic for Berget OAuth
 */

import type { Auth } from '@opencode-ai/sdk';

import type { OAuthAuthDetails, PluginInput, RefreshResult } from './types';

import { getTokenRefreshEndpoint } from '../constants';
import { accessTokenExpired, isOAuthAuth } from './auth';
import { logDebug, logError } from './debug';
import { resilientFetch } from './resilient-fetch';

// Track in-flight refresh requests to prevent duplicates
const refreshInFlight = new Map<string, Promise<RefreshResult>>();

/**
 * Refreshes an expired access token using the refresh token
 * Accepts client for persisting refreshed tokens to OpenCode
 */
export async function refreshAccessTokenDirect(
  auth: OAuthAuthDetails,
  client?: PluginInput['client'],
  getAuth?: () => Promise<Auth>,
): Promise<RefreshResult> {
  const refreshToken = auth.refresh;

  if (!refreshToken) {
    logDebug('No refresh token available');
    return { reason: 'No refresh token available', success: false };
  }

  // Check if refresh is already in flight
  const pending = refreshInFlight.get(refreshToken);
  if (pending) {
    logDebug('Refresh already in flight, waiting for result');
    return pending;
  }

  // Start refresh and track the promise
  const refreshPromise = refreshAccessTokenInternal(auth, client, getAuth);
  refreshInFlight.set(refreshToken, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    refreshInFlight.delete(refreshToken);
  }
}

/**
 * Parses a successful token refresh JSON response into a RefreshResult.
 */
function buildRefreshResult(
  data: Record<string, unknown>,
  auth: OAuthAuthDetails,
  client?: PluginInput['client'],
): RefreshResult {
  if (typeof data.token !== 'string' || typeof data.expires_in !== 'number') {
    logDebug('Refresh endpoint returned malformed body');
    return {
      reason: 'Invalid token response from refresh endpoint',
      success: false,
    };
  }

  logDebug(`Token refreshed, expires_in=${data.expires_in}s`);

  // Build updated auth
  const updatedAuth: OAuthAuthDetails = {
    ...auth,
    access: data.token,
    expires: Date.now() + data.expires_in * 1000,
    refresh: typeof data.refresh_token === 'string' ? data.refresh_token : auth.refresh, // Use new refresh token if rotated
  };

  // Persist updated tokens to OpenCode so they survive restarts
  if (client) {
    persistRefreshedToken(client, updatedAuth).catch(() => {
      // Already logged inside persistRefreshedToken
    });
  }

  return { auth: updatedAuth, success: true };
}

/**
 * Handles the HTTP error response from the token refresh endpoint.
 * Decides whether to recover from disk (invalid_grant) or fail.
 *
 * Note: 5xx retries are handled by resilientFetch at the transport layer.
 * This function only handles domain-level errors (invalid_grant, etc.).
 */
async function handleErrorResponse(
  response: Response,
  errorText: string,
  _attempt: number,
  auth: OAuthAuthDetails,
  client: PluginInput['client'] | undefined,
  getAuth: (() => Promise<Auth>) | undefined,
): Promise<RefreshResult> {
  // Handle revoked/invalid refresh token
  if (response.status === 401 || response.status === 400) {
    const errorData = parseErrorResponse(errorText);

    if (errorData?.error === 'invalid_grant' || errorData?.error === 'invalid_token') {
      // Try reloading from disk before failing - another process may have refreshed
      const recovered = getAuth ? await tryRecoverFromDisk(getAuth) : undefined;
      if (recovered) {
        logDebug('Recovered from invalid_grant: valid token found on disk');
        return { auth: recovered, success: true };
      }

      const reason = 'Refresh token is invalid or revoked';
      console.warn(
        '[Berget Auth] Refresh token is invalid or revoked. Please run `opencode auth login` to reauthenticate.',
      );
      return { reason, success: false };
    }

    return { reason: `Token refresh failed: HTTP ${response.status}`, success: false };
  }

  // 5xx errors have already been retried by resilientFetch
  return { reason: `Token refresh failed: HTTP ${response.status}`, success: false };
}

/**
 * Parses error response from token endpoint
 */
function parseErrorResponse(
  text: string,
): undefined | { error?: string; error_description?: string } {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Persists refreshed tokens to OpenCode client.
 */
async function persistRefreshedToken(
  client: PluginInput['client'],
  updatedAuth: OAuthAuthDetails,
): Promise<void> {
  if (!updatedAuth.access || typeof updatedAuth.expires !== 'number') {
    return;
  }

  try {
    await client.auth.set({
      body: {
        access: updatedAuth.access,
        expires: updatedAuth.expires,
        refresh: updatedAuth.refresh,
        type: 'oauth',
      },
      path: { id: 'berget' },
    });
    logDebug('Token refresh persisted to OpenCode');
  } catch (error) {
    // Non-fatal: in-memory token still works for this session
    console.warn('[Berget Auth] Failed to persist token refresh:', error);
  }
}

/**
 * Internal implementation of token refresh
 *
 * Uses resilientFetch which retries transient network errors (ECONNRESET,
 * ETIMEDOUT, socket hang up) and server errors (502/503/504) with
 * exponential backoff and jitter. The attempt parameter is kept for
 * backward compatibility with handleErrorResponse but is always 1 now
 * since resilientFetch handles transport-level retries.
 */
async function refreshAccessTokenInternal(
  auth: OAuthAuthDetails,
  client?: PluginInput['client'],
  getAuth?: () => Promise<Auth>,
  attempt = 1,
): Promise<RefreshResult> {
  logDebug('Refreshing access token');

  try {
    const response = await resilientFetch(getTokenRefreshEndpoint(), {
      body: JSON.stringify({
        refresh_token: auth.refresh,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logDebug(`Token refresh failed: ${response.status} ${errorText}`);
      return handleErrorResponse(response, errorText, attempt, auth, client, getAuth);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return buildRefreshResult(data, auth, client);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error';
    logError('Failed to refresh Berget access token after retries', error);
    return { reason: `Network error: ${reason}`, success: false };
  }
}

/**
 * Attempts to recover from invalid_grant/invalid_token by reloading auth from disk.
 * Returns the disk auth if valid and non-expired, otherwise undefined.
 */
async function tryRecoverFromDisk(
  getAuth: () => Promise<Auth>,
): Promise<OAuthAuthDetails | undefined> {
  try {
    const diskAuth = await getAuth();
    if (
      isOAuthAuth(diskAuth) &&
      diskAuth.access &&
      !accessTokenExpired(diskAuth as unknown as OAuthAuthDetails)
    ) {
      return diskAuth as unknown as OAuthAuthDetails;
    }
  } catch {
    // Fall through — no recovery possible
  }
  return undefined;
}
