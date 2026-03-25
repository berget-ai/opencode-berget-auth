/**
 * Device Authorization Flow implementation for Berget
 * Based on RFC 8628 - OAuth 2.0 Device Authorization Grant
 */

import { spawn } from "node:child_process";
import {
  getDeviceAuthEndpoint,
  getDeviceTokenEndpoint,
  DEVICE_POLL_INTERVAL_MS,
  DEVICE_POLL_MAX_ATTEMPTS,
} from "../constants";
import { logDebug } from "./debug";
import type {
  DeviceAuthResponse,
  DeviceTokenResponse,
  AuthorizeResult,
  AuthOAuthResult,
} from "./types";

/**
 * Initiates the device authorization flow
 * Returns device code and verification URL for user authentication
 */
export async function initiateDeviceFlow(): Promise<DeviceAuthResponse> {
  logDebug("Initiating device authorization flow");

  const response = await fetch(getDeviceAuthEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Failed to initiate device flow: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as DeviceAuthResponse;

  logDebug(`Device flow initiated: user_code=${data.user_code}`);

  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_url: data.verification_url,
    expires_in: data.expires_in,
    interval: data.interval || DEVICE_POLL_INTERVAL_MS / 1000,
  };
}

/**
 * Polls for token completion after user authenticates
 */
export async function pollForToken(
  deviceCode: string,
  interval: number = DEVICE_POLL_INTERVAL_MS
): Promise<AuthOAuthResult> {
  logDebug("Starting device token polling");

  let attempts = 0;

  while (attempts < DEVICE_POLL_MAX_ATTEMPTS) {
    attempts++;

    // Wait before polling (except first attempt)
    if (attempts > 1) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    logDebug(`Poll attempt ${attempts}/${DEVICE_POLL_MAX_ATTEMPTS}`);

    try {
      const response = await fetch(getDeviceTokenEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ device_code: deviceCode }),
      });

      const data = (await response.json()) as DeviceTokenResponse;

      // Still pending - user hasn't completed authentication
      if (data.pending) {
        logDebug("Authorization pending, continuing to poll");
        continue;
      }

      // Error occurred
      if (data.error) {
        if (data.error === "authorization_pending") {
          continue;
        }
        if (data.error === "slow_down") {
          // Increase polling interval
          interval = Math.min(interval * 2, 10000);
          logDebug(`Slowing down polling, new interval: ${interval}ms`);
          continue;
        }
        if (data.error === "expired_token") {
          return {
            type: "failed",
            error: "Device code expired. Please try again.",
          };
        }
        if (data.error === "access_denied") {
          return {
            type: "failed",
            error: "Access denied by user.",
          };
        }

        return {
          type: "failed",
          error: data.error,
        };
      }

      // Success - we got tokens!
      if (data.token) {
        logDebug("Successfully obtained tokens");

        // Calculate expiration time
        const expiresIn = data.expires_in || 3600;
        const expires = Date.now() + expiresIn * 1000;

        return {
          type: "success",
          access: data.token,
          refresh: data.refresh_token || "",
          expires,
        };
      }
    } catch (error) {
      logDebug(`Poll error: ${error}`);
      // Network errors - continue polling
      continue;
    }
  }

  return {
    type: "failed",
    error: "Timed out waiting for authorization. Please try again.",
  };
}

/**
 * Opens a URL in the user's default browser
 */
function openBrowserUrl(url: string): void {
  try {
    const platform = process.platform;
    const command =
      platform === "darwin"
        ? "open"
        : platform === "win32"
          ? "rundll32"
          : "xdg-open";
    const args =
      platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];

    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
    });
    child.unref?.();

    logDebug(`Opened browser with command: ${command}`);
  } catch (error) {
    logDebug(`Failed to open browser: ${error}`);
  }
}

/**
 * Checks if running in a headless environment
 */
function isHeadlessEnvironment(): boolean {
  return !!(
    process.env.SSH_CONNECTION ||
    process.env.SSH_CLIENT ||
    process.env.SSH_TTY ||
    process.env.OPENCODE_HEADLESS ||
    process.env.CI
  );
}

/**
 * Creates the OAuth authorize method for the plugin
 * This is called when user selects "Login with Berget" in OpenCode
 */
export function createDeviceFlowAuthorizeMethod(): () => Promise<AuthorizeResult> {
  return async (): Promise<AuthorizeResult> => {
    const isHeadless = isHeadlessEnvironment();

    if (isHeadless) {
      logDebug("Headless environment detected");
    }

    // Initiate the device flow
    const deviceAuth = await initiateDeviceFlow();

    // Try to open browser automatically if not headless
    if (!isHeadless) {
      openBrowserUrl(deviceAuth.verification_url);
    }

    // Calculate poll interval in milliseconds
    const pollInterval = (deviceAuth.interval || 5) * 1000;

    return {
      url: deviceAuth.verification_url,
      instructions: isHeadless
        ? `Open the URL above in your browser and enter code: ${deviceAuth.user_code}\n\nThen paste the authorization code here when complete.`
        : `Complete the sign-in flow in your browser. The page should have opened automatically.\n\nYour code is: ${deviceAuth.user_code}`,
      method: "auto" as const,
      callback: async (): Promise<AuthOAuthResult> => {
        return await pollForToken(deviceAuth.device_code, pollInterval);
      },
    };
  };
}
