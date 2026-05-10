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
 * Clears cached auth for a specific refresh token
 */
export function clearCachedAuth(refresh: string): void {
  authCache.delete(refresh || "anonymous");
}
