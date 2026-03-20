/**
 * In-memory cache for authentication state
 * Prevents redundant token operations within the same session
 */

import type { OAuthAuthDetails } from "./types";

// Cache TTL - 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedAuth {
  auth: OAuthAuthDetails;
  timestamp: number;
}

const authCache = new Map<string, CachedAuth>();

/**
 * Generates a cache key from auth details
 */
function getCacheKey(auth: OAuthAuthDetails): string {
  // Use refresh token as the primary key since it's stable
  return auth.refresh || "anonymous";
}

/**
 * Stores auth details in cache
 */
export function storeCachedAuth(auth: OAuthAuthDetails): void {
  const key = getCacheKey(auth);
  authCache.set(key, {
    auth,
    timestamp: Date.now(),
  });
}

/**
 * Retrieves cached auth if still valid
 * Returns the cached auth merged with any new access token
 */
export function resolveCachedAuth(auth: OAuthAuthDetails): OAuthAuthDetails {
  const key = getCacheKey(auth);
  const cached = authCache.get(key);

  if (!cached) {
    return auth;
  }

  // Check if cache is still valid
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    authCache.delete(key);
    return auth;
  }

  // Return cached auth with potentially updated access token
  // If incoming auth has a newer access token, use that
  if (auth.access && auth.expires && cached.auth.expires) {
    if (auth.expires > cached.auth.expires) {
      // Incoming auth is newer, update cache
      storeCachedAuth(auth);
      return auth;
    }
  }

  return cached.auth;
}

/**
 * Clears cached auth for a specific refresh token
 */
export function clearCachedAuth(refresh: string): void {
  authCache.delete(refresh || "anonymous");
}

/**
 * Clears all cached auth entries
 */
export function clearAllCachedAuth(): void {
  authCache.clear();
}

/**
 * Gets cache stats for debugging
 */
export function getCacheStats(): {
  size: number;
  entries: Array<{ key: string; age: number }>;
} {
  const now = Date.now();
  const entries: Array<{ key: string; age: number }> = [];

  for (const [key, cached] of authCache.entries()) {
    entries.push({
      key: key.substring(0, 8) + "...", // Truncate for privacy
      age: Math.round((now - cached.timestamp) / 1000),
    });
  }

  return {
    size: authCache.size,
    entries,
  };
}
