/**
 * Debug utilities for Berget Auth Plugin
 */

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return (
    process.env.OPENCODE_BERGET_DEBUG === "1" ||
    process.env.OPENCODE_BERGET_DEBUG === "true" ||
    process.env.DEBUG?.includes("berget") === true
  );
}

/**
 * Log a debug message if debug mode is enabled
 */
export function logDebug(message: string): void {
  if (isDebugEnabled()) {
    const timestamp = new Date().toISOString();
    console.log(`[Berget Auth ${timestamp}] ${message}`);
  }
}

/**
 * Log an error message (always shown)
 */
export function logError(message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const errorDetail = error instanceof Error ? error.message : String(error);
  console.error(`[Berget Auth ${timestamp}] ERROR: ${message}`, errorDetail);
}

/**
 * Log a warning message (always shown)
 */
export function logWarn(message: string): void {
  const timestamp = new Date().toISOString();
  console.warn(`[Berget Auth ${timestamp}] WARN: ${message}`);
}

/**
 * Safely stringify an object for logging, redacting sensitive fields
 */
export function safeStringify(obj: unknown): string {
  const sensitiveKeys = [
    "access_token",
    "refresh_token",
    "token",
    "access",
    "refresh",
    "password",
    "secret",
    "apiKey",
    "api_key",
  ];

  return JSON.stringify(
    obj,
    (key, value) => {
      if (sensitiveKeys.includes(key.toLowerCase()) && typeof value === "string") {
        if (value.length > 10) {
          return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
        }
        return "[REDACTED]";
      }
      return value;
    },
    2
  );
}

/**
 * Format request/response for debug logging
 */
export function formatRequestDebug(
  method: string,
  url: string,
  status?: number,
  body?: unknown
): string {
  const parts = [`${method} ${url}`];

  if (status !== undefined) {
    parts.push(`Status: ${status}`);
  }

  if (body !== undefined && isDebugEnabled()) {
    parts.push(`Body: ${safeStringify(body)}`);
  }

  return parts.join(" | ");
}
