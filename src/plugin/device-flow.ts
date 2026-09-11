/**
 * OAuth 2.0 Device Authorization Grant for Berget
 * Based on RFC 8628
 *
 * Used in headless environments (SSH, CI) where a local callback
 * server is not feasible. The user authenticates on another device.
 */

import QRCode from 'qrcode';

import type { AuthOAuthResult, AuthorizeResult } from './types';

import { getKeycloakRealm, getKeycloakUrl, KEYCLOAK_CLIENT_ID } from '../constants';
import { logDebug } from './debug';

const DEVICE_AUTHORIZATION_ENDPOINT_PATH = '/protocol/openid-connect/auth/device';
const TOKEN_ENDPOINT_PATH = '/protocol/openid-connect/token';

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 30;

interface DeviceAuthorizationResponse {
  device_code: string;
  expires_in: number;
  interval?: number;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
}

interface TokenErrorResponse {
  error?: string;
  error_description?: string;
}

export function createDeviceAuthorizeMethod(): (
  inputs?: Record<string, string>,
) => Promise<AuthorizeResult> {
  return executeDeviceAuthorization;
}

export function extractTokenResult(data: Record<string, unknown>): AuthOAuthResult | undefined {
  if (!(typeof data.access_token === 'string' && typeof data.expires_in === 'number')) {
    return undefined;
  }
  if (typeof data.refresh_token !== 'string') {
    logDebug('Token poll returned malformed body');
    return { error: 'Invalid token response from authorization server', type: 'failed' };
  }

  logDebug('Successfully obtained tokens via device flow');

  return {
    access: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
    refresh: data.refresh_token,
    type: 'success',
  };
}

export function handleTokenPollError(
  errorData: TokenErrorResponse,
  intervalSeconds: number,
): { interval?: number; result?: AuthOAuthResult } {
  switch (errorData.error) {
    case 'access_denied': {
      return { result: { error: 'Sign-in was denied in the browser.', type: 'failed' } };
    }
    case 'authorization_pending': {
      return {};
    }
    case 'expired_token': {
      return {
        result: { error: 'Device code expired. Please try signing in again.', type: 'failed' },
      };
    }
    case 'slow_down': {
      const newInterval = Math.min(
        intervalSeconds + DEFAULT_POLL_INTERVAL_SECONDS,
        MAX_POLL_INTERVAL_SECONDS,
      );
      logDebug(`Received slow_down, new interval: ${newInterval}s`);
      return { interval: newInterval };
    }
    default: {
      return { result: { error: formatPollError(errorData), type: 'failed' } };
    }
  }
}

async function buildInstructions(
  deviceInfo: DeviceAuthorizationResponse,
  verificationUri: string,
): Promise<string> {
  const qrCode = await generateTerminalQrCode(verificationUri);
  const validMinutes = Math.round(deviceInfo.expires_in / 60);

  const lines = [
    'Scan with your phone:',
    '',
    ...qrCode.split('\n').map((line) => centerLine(line)),
    '',
    `Or open the link below — the code is included (valid for ${validMinutes} minutes).`,
  ];
  return lines.join('\n');
}

/**
 * Approximate content width of the OpenCode instructions dialog.
 * Used to center the QR code and user code box.
 */
const DIALOG_CONTENT_WIDTH = 56;

function centerLine(line: string): string {
  const pad = Math.max(0, Math.floor((DIALOG_CONTENT_WIDTH - line.length) / 2));
  return ' '.repeat(pad) + line;
}

async function executeDeviceAuthorization(
  _inputs?: Record<string, string>,
): Promise<AuthorizeResult> {
  const baseUrl = `${getKeycloakUrl()}/realms/${getKeycloakRealm()}`;

  let deviceInfo: DeviceAuthorizationResponse;
  try {
    const response = await fetch(`${baseUrl}${DEVICE_AUTHORIZATION_ENDPOINT_PATH}`, {
      body: new URLSearchParams({
        client_id: KEYCLOAK_CLIENT_ID,
        scope: 'openid email profile offline_access device-email-otp',
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug(`Device authorization failed: ${errorText}`);
      throw new Error(`Keycloak rejected device authorization (${response.status})`);
    }

    deviceInfo = (await response.json()) as DeviceAuthorizationResponse;
  } catch (error) {
    return {
      callback: async (): Promise<AuthOAuthResult> => ({
        error: `Failed to start device flow: ${error instanceof Error ? error.message : String(error)}`,
        type: 'failed',
      }),
      instructions: 'Device flow could not be started.',
      method: 'auto' as const,
      url: '',
    };
  }

  logDebug(
    `Device flow started, user_code=${deviceInfo.user_code}, expires_in=${deviceInfo.expires_in}`,
  );

  const verificationUri = deviceInfo.verification_uri_complete ?? deviceInfo.verification_uri;

  const instructions = await buildInstructions(deviceInfo, verificationUri);

  return {
    callback: async (): Promise<AuthOAuthResult> => {
      return pollForTokens(baseUrl, deviceInfo);
    },
    instructions,
    method: 'auto' as const,
    url: verificationUri,
  };
}

function formatPollError(errorData: TokenErrorResponse): string {
  if (!errorData.error_description) {
    return `Device flow failed: ${errorData.error}`;
  }
  const description = errorData.error_description;
  return `Device flow failed: ${errorData.error} — ${description}`;
}

const QR_QUIET_ZONE_MODULES = 2;

/**
 * Single token poll request. Returns undefined on transport errors or
 * non-JSON bodies (e.g. a 502 HTML page from the gateway in front of
 * Keycloak) so the caller keeps retrying until the deadline.
 */
async function fetchTokenPollBody(
  baseUrl: string,
  deviceInfo: DeviceAuthorizationResponse,
): Promise<Record<string, unknown> | undefined> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${TOKEN_ENDPOINT_PATH}`, {
      body: new URLSearchParams({
        client_id: KEYCLOAK_CLIENT_ID,
        device_code: deviceInfo.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });
  } catch (error) {
    logDebug(
      `Token poll request failed, retrying: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }

  try {
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    logDebug(
      `Token poll returned non-JSON body (status ${response.status}), retrying: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

/**
 * Renders the QR matrix as half-block pairs: one character covers two
 * vertical modules using ▀/▄/█/space. Terminal cells are ~1:2 (w:h),
 * so one module = one char wide, half a char tall — i.e. square pixels.
 * (Quadrant ▘▝▖▗ rendering halves the height further but assumes square
 * cells, producing a stretched, unreliable-to-scan code.)
 * Light blocks on the terminal's dark background — scannable on dark themes.
 */
async function generateTerminalQrCode(data: string): Promise<string> {
  // Error correction 'L' keeps the matrix one version smaller than 'M' for
  // our URL length — damage tolerance matters little on a clean screen.
  const code = QRCode.create(data, { errorCorrectionLevel: 'L' });
  const size = code.modules.size;
  const total = size + QR_QUIET_ZONE_MODULES * 2;

  const moduleAt = (row: number, col: number): number => {
    const qrRow = row - QR_QUIET_ZONE_MODULES;
    const qrCol = col - QR_QUIET_ZONE_MODULES;
    if (qrRow < 0 || qrRow >= size || qrCol < 0 || qrCol >= size) {
      return 0;
    }
    return code.modules.get(qrRow, qrCol) === 1 ? 1 : 0;
  };

  const rows: string[] = [];
  for (let r = 0; r < total; r += 2) {
    let row = '';
    for (let c = 0; c < total; c += 1) {
      const top = moduleAt(r, c) === 1;
      const bottom = moduleAt(r + 1, c) === 1;
      if (top && bottom) {
        row += '█';
      } else if (top) {
        row += '▀';
      } else if (bottom) {
        row += '▄';
      } else {
        row += ' ';
      }
    }
    rows.push(row);
  }

  return rows.join('\n');
}

async function pollForTokens(
  baseUrl: string,
  deviceInfo: DeviceAuthorizationResponse,
): Promise<AuthOAuthResult> {
  const deadline = Date.now() + deviceInfo.expires_in * 1000;
  let intervalSeconds = deviceInfo.interval ?? DEFAULT_POLL_INTERVAL_SECONDS;

  while (Date.now() < deadline) {
    await sleep(intervalSeconds * 1000);

    const data = await fetchTokenPollBody(baseUrl, deviceInfo);
    if (!data) {
      continue;
    }

    const success = extractTokenResult(data);
    if (success) {
      return success;
    }
    const errorData = data as unknown as TokenErrorResponse;

    const action = handleTokenPollError(errorData, intervalSeconds);
    if (action.interval !== undefined) {
      intervalSeconds = action.interval;
    }
    if (action.result) {
      return action.result;
    }
  }

  return { error: 'Authentication timed out. Please try signing in again.', type: 'failed' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
