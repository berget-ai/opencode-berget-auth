/**
 * Token refresh logic for Berget OAuth
 */

import type { OAuthAuthDetails, TokenRefreshResponse } from "./types";

import { ACCESS_TOKEN_EXPIRY_BUFFER_MS, getTokenRefreshEndpoint } from "../constants";
import { logDebug } from "./debug";

// Track in-flight refresh requests to prevent duplicates
const refreshInFlight = new Map<string, Promise<OAuthAuthDetails | undefined>>();

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
 * Parses error response from token endpoint
 */
function parseErrorResponse(
  text: string
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
 * Internal implementation of token refresh
 */
async function refreshAccessTokenInternal(
  auth: OAuthAuthDetails
): Promise<OAuthAuthDetails | undefined> {
  const refreshToken = auth.refresh;

  logDebug("Refreshing access token");

  try {
    const response = await fetch(getTokenRefreshEndpoint(), {
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logDebug(`Token refresh failed: ${response.status} ${errorText}`);

      // Handle revoked/invalid refresh token
      if (response.status === 401 || response.status === 400) {
        const errorData = parseErrorResponse(errorText);

        if (errorData?.error === "invalid_grant" || errorData?.error === "invalid_token") {
          console.warn(
            "[Berget Auth] Refresh token is invalid or revoked. Please run `opencode auth login` to reauthenticate."
          );
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
      expires: Date.now() + data.expires_in * 1000 - ACCESS_TOKEN_EXPIRY_BUFFER_MS,
      refresh: data.refresh_token || refreshToken, // Use new refresh token if rotated
    };

    return updatedAuth;
  } catch (error) {
    console.error("Failed to refresh Berget access token:", error);
    return undefined;
  }
}
