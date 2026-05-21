/**
 * Debug utilities for Berget Auth Plugin
 */

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
  if (error === undefined) {
    console.error(`[Berget Auth ${timestamp}] ERROR: ${message}`);
  } else {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error(`[Berget Auth ${timestamp}] ERROR: ${message}`, errorDetail);
  }
}

/**
 * Check if debug mode is enabled
 */
function isDebugEnabled(): boolean {
  return (
    process.env.OPENCODE_BERGET_DEBUG === '1' ||
    process.env.OPENCODE_BERGET_DEBUG === 'true' ||
    process.env.DEBUG?.includes('berget') === true
  );
}
