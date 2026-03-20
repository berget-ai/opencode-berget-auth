/**
 * Authentication utilities for Berget OAuth
 */

import { ACCESS_TOKEN_EXPIRY_BUFFER_MS } from "../constants";
import type { OAuthAuthDetails } from "./types";

/**
 * Type guard to check if auth is OAuth-based
 */
export function isOAuthAuth(auth: unknown): auth is OAuthAuthDetails {
  return (
    typeof auth === "object" &&
    auth !== null &&
    "type" in auth &&
    (auth as { type: string }).type === "oauth"
  );
}

/**
 * Determines whether an access token is expired or missing
 * Includes buffer time to account for clock skew and network latency
 */
export function accessTokenExpired(auth: OAuthAuthDetails): boolean {
  if (!auth.access || typeof auth.expires !== "number") {
    return true;
  }
  return auth.expires <= Date.now() + ACCESS_TOKEN_EXPIRY_BUFFER_MS;
}

/**
 * Extracts the refresh token from stored auth
 * For Berget, we store just the refresh token (no packed format needed)
 */
export function getRefreshToken(auth: OAuthAuthDetails): string | undefined {
  return auth.refresh || undefined;
}

/**
 * Validates that an access token appears to be a valid JWT
 * Basic structural check only - actual validation happens server-side
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }

  // JWT tokens have three base64-encoded parts separated by dots
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  // Each part should be non-empty
  return parts.every((part) => part.length > 0);
}

/**
 * Decodes JWT payload without verification (for reading claims client-side)
 * Returns undefined if token is malformed
 */
export function decodeJwtPayload(
  token: string
): Record<string, unknown> | undefined {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return undefined;
    }

    // Decode base64url to regular base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    // Pad if necessary
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );

    // Decode and parse
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return undefined;
  }
}

/**
 * Gets token expiration time from JWT claims
 * Returns undefined if token is invalid or has no exp claim
 */
export function getTokenExpiration(token: string): number | undefined {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    return undefined;
  }

  // JWT exp is in seconds, convert to milliseconds
  return payload.exp * 1000;
}

/**
 * Checks if a token is about to expire (within buffer period)
 */
export function isTokenExpiringSoon(token: string): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true; // Treat unknown expiration as expiring
  }

  return expiration <= Date.now() + ACCESS_TOKEN_EXPIRY_BUFFER_MS;
}
