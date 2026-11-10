/**
 * Resilient fetch wrapper with retry, timeout, and error classification.
 *
 * Handles transient network errors (ECONNRESET, ETIMEDOUT, socket hang up, etc.)
 * that commonly occur with long-lived connections to AI inference endpoints.
 */

import { logDebug } from './debug';

/** Network error codes that are safe to retry */
const RETRYABLE_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNRESET',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** HTTP status codes that are safe to retry */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

/** Default request timeout (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Default retry configuration */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8000;

export interface ResilientFetchOptions {
  /** Base delay for exponential backoff in ms (default: 500) */
  baseDelayMs?: number;
  /** Maximum delay between retries in ms (default: 8000) */
  maxDelayMs?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Request timeout in ms (default: 30000, 0 to disable) */
  timeoutMs?: number;
}

/**
 * Resilient fetch wrapper with automatic retry on transient network errors.
 *
 * Retries on:
 * - Network errors: ECONNRESET, ETIMEDOUT, socket hang up, etc.
 * - HTTP status codes: 408, 429, 502, 503, 504
 *
 * Does NOT retry on:
 * - User-initiated aborts (AbortError)
 * - Client errors (4xx except 408/429)
 * - Successful responses (2xx)
 *
 * @example
 * ```ts
 * const response = await resilientFetch('https://api.berget.ai/v1/chat', {
 *   method: 'POST',
 *   body: JSON.stringify({ messages }),
 *   headers: { 'Content-Type': 'application/json' },
 * });
 * ```
 */
export async function resilientFetch(
  input: Request | string | URL,
  init?: RequestInit,
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const {
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(input, init, timeoutMs);

      if (!isRetryableStatus(response.status) || attempt >= maxRetries) {
        return response;
      }

      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      logDebug(
        `HTTP ${response.status} on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt >= maxRetries) {
        throw error;
      }

      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      const errorDetail = error instanceof Error ? error.message : String(error);
      logDebug(
        `Network error on attempt ${attempt + 1}/${maxRetries + 1}: ${errorDetail}, retrying in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Calculates delay with exponential backoff and jitter.
 * Jitter prevents thundering herd when many clients retry simultaneously.
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  // Not security-sensitive: jitter is only used to spread retry timing
  // eslint-disable-next-line sonarjs/pseudo-random
  const jitter = exponentialDelay * (0.5 + Math.random() * 0.5);
  return Math.floor(jitter);
}

/**
 * Wraps a fetch call with a timeout via AbortSignal.timeout().
 * If the request takes longer than `timeoutMs`, it is aborted.
 */
async function fetchWithTimeout(
  input: Request | string | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  if (timeoutMs <= 0) {
    return fetch(input, init);
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  if (init?.signal) {
    const compositeSignal = AbortSignal.any([init.signal, timeoutSignal]);
    return fetch(input, { ...init, signal: compositeSignal });
  }

  return fetch(input, { ...init, signal: timeoutSignal });
}

/**
 * Determines whether an error from fetch is transient and safe to retry.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false;
  }

  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }

  if (error instanceof Error && 'code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_ERROR_CODES.has(code)) {
      return true;
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('econnreset') ||
      message.includes('socket hang up') ||
      message.includes('etimedout') ||
      message.includes('network') ||
      message.includes('fetch failed')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether an HTTP response status is retryable.
 */
function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}
