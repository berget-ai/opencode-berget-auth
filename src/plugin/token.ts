/**
 * Token refresh logic for Berget OAuth
 */

import { getTokenRefreshEndpoint } from "../constants";
import { clearCachedAuth, storeCachedAuth } from "./cache";
import { logDebug } from "./debug";
import type { OAuthAuthDetails, TokenRefreshResponse } from "./types";

// Track in-flight refresh requests to prevent duplicates
const refreshInFlight = new Map<
  string,
  Promise<OAuthAuthDetails | undefined>
>();

/**
 * Refreshes an expired access token using the refresh token
 * Direct version without client dependency (for loader use)
 */
export async function refreshAccessTokenDirect(
  auth: OAuthAuthDetails
): Promise<OAuthAuthDetails | undefined> {
  const refreshToken = auth.refresh;

  if (!refreshToken) {
    logDebug("No refresh token available");
    return undefined;
  }

  // Check if refresh is already in flight
  const pending = refreshInFlight.get(refreshToken);
  if (pending) {
    logDebug("Refresh already in flight, waiting for result");
    return pending;
  }

  // Start refresh and track the promise
  const refreshPromise = refreshAccessTokenInternal(auth);
  refreshInFlight.set(refreshToken, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    refreshInFlight.delete(refreshToken);
  }
}

/**
 * Internal implementation of token refresh
 */
async function refreshAccessTokenInternal(
  auth: OAuthAuthDetails
): Promise<OAuthAuthDetails | undefined> {
  const refreshToken = auth.refresh;

  logDebug("Refreshing access token");

  try {
    const response = await fetch(getTokenRefreshEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logDebug(`Token refresh failed: ${response.status} ${errorText}`);

      // Handle revoked/invalid refresh token
      if (response.status === 401 || response.status === 400) {
        const errorData = parseErrorResponse(errorText);

        if (
          errorData?.error === "invalid_grant" ||
          errorData?.error === "invalid_token"
        ) {
          console.warn(
            "[Berget Auth] Refresh token is invalid or revoked. Please run `opencode auth login` to reauthenticate."
          );

          // Clear cached auth
          clearCachedAuth(refreshToken);
        }

        return undefined;
      }

      // Other errors - might be temporary
      return undefined;
    }

    const data = (await response.json()) as TokenRefreshResponse;

    logDebug(`Token refreshed, expires_in=${data.expires_in}s`);

    // Build updated auth
    const updatedAuth: OAuthAuthDetails = {
      ...auth,
      access: data.token,
      expires: Date.now() + data.expires_in * 1000,
      refresh: data.refresh_token || refreshToken, // Use new refresh token if rotated
    };

    // Update cache
    clearCachedAuth(refreshToken);
    storeCachedAuth(updatedAuth);

    return updatedAuth;
  } catch (error) {
    console.error("Failed to refresh Berget access token:", error);
    return undefined;
  }
}

/**
 * Parses error response from token endpoint
 */
function parseErrorResponse(
  text: string
): { error?: string; error_description?: string } | undefined {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
