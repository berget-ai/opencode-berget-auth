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
