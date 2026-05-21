/**
 * PKCE Authorization Flow implementation for Berget
 * Based on RFC 7636 - Proof Key for Code Exchange
 *
 * This flow is preferred for desktop environments where a local
 * callback server can be started. It works better with magic link
 * authentication than device flow.
 */

import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as url from 'node:url';

import type { AuthOAuthResult, AuthorizeResult } from './types';

import {
  ACCESS_TOKEN_EXPIRY_BUFFER_MS,
  getKeycloakRealm,
  getKeycloakUrl,
  KEYCLOAK_CLIENT_ID,
  PKCE_CALLBACK_PORT,
} from '../constants';
import { logDebug } from './debug';

/**
 * Creates the OAuth authorize method using PKCE flow
 * This is called when user selects "Login with Berget" in OpenCode
 */
export function createPkceAuthorizeMethod(): (
  inputs?: Record<string, string>,
) => Promise<AuthorizeResult> {
  return executePkceAuthorization;
}

/**
 * Builds the HTML response for the callback page
 */
function buildHtmlResponse(success: boolean, message: string): string {
  const gradient = success
    ? 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)'
    : 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)';
  const shadow = success ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)';
  const icon = success
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  const title = success ? 'Authentication Successful' : 'Authentication Failed';

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Berget - ${title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
            color: #fff;
          }
          .container {
            text-align: center;
            padding: 3rem;
            max-width: 400px;
          }
          .icon {
            width: 80px;
            height: 80px;
            background: ${gradient};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem;
            box-shadow: 0 4px 20px ${shadow};
          }
          .icon svg {
            width: 40px;
            height: 40px;
            stroke: #fff;
            stroke-width: 3;
          }
          h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
            color: #fff;
          }
          p {
            color: #94a3b8;
            font-size: 0.95rem;
            line-height: 1.5;
          }
          .brand {
            margin-top: 2rem;
            opacity: 0.5;
            font-size: 0.8rem;
            letter-spacing: 0.05em;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">${icon}</div>
          <h1>${title}</h1>
          <p>${message}</p>
          <div class="brand">BERGET</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Creates a local HTTP server to receive the OAuth callback
 */
function createCallbackServerPromise(
  state: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<AuthOAuthResult> {
  return new Promise((resolve) => {
    const server = http.createServer(async (request, response) => {
      const parsedUrl = url.parse(request.url || '', true);

      if (parsedUrl.pathname !== '/callback') return;

      await handleCallbackRequest(
        response,
        server,
        parsedUrl,
        state,
        codeVerifier,
        redirectUri,
        resolve,
      );
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      handleServerError(error, resolve);
    });

    server.listen(PKCE_CALLBACK_PORT, '127.0.0.1', () => {
      logDebug(`Callback server listening on 127.0.0.1:${PKCE_CALLBACK_PORT}`);
    });

    // Timeout after 5 minutes
    setTimeout(
      () => {
        server.close();
        resolve({
          error: 'Authentication timed out. Please try again.',
          type: 'failed',
        });
      },
      5 * 60 * 1000,
    );
  });
}

/**
 * Exchanges authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<AuthOAuthResult> {
  const tokenUrl = `${getKeycloakUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/token`;

  logDebug(`Exchanging code for tokens at ${tokenUrl}`);

  const response = await fetch(tokenUrl, {
    body: new URLSearchParams({
      client_id: KEYCLOAK_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text();
    logDebug(`Token exchange failed: ${errorText}`);
    return {
      error: `Failed to exchange code for tokens: ${errorText}`,
      type: 'failed',
    };
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
  };

  const expires = Date.now() + tokenData.expires_in * 1000 - ACCESS_TOKEN_EXPIRY_BUFFER_MS;

  logDebug('Successfully obtained tokens via PKCE');

  return {
    access: tokenData.access_token,
    expires,
    refresh: tokenData.refresh_token,
    type: 'success',
  };
}

async function executePkceAuthorization(
  _inputs?: Record<string, string>,
): Promise<AuthorizeResult> {
  const isHeadless = isHeadlessEnvironment();

  if (isHeadless) {
    logDebug('Headless environment detected - PKCE flow may not work');
    // In headless mode, we could fall back to device flow
    // For now, we'll still try PKCE but warn the user
  }

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `http://localhost:${PKCE_CALLBACK_PORT}/callback`;

  // Build authorization URL
  const authUrl = new URL(
    `${getKeycloakUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/auth`,
  );
  authUrl.searchParams.set('client_id', KEYCLOAK_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid email profile offline_access');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  logDebug(`Authorization URL: ${authUrl.toString()}`);

  // Open browser
  if (!isHeadless) {
    openBrowserUrl(authUrl.toString());
  }

  return {
    callback: async (): Promise<AuthOAuthResult> => {
      return createCallbackServerPromise(state, codeVerifier, redirectUri);
    },
    instructions: isHeadless
      ? `Open the URL above in your browser to sign in.\n\nNote: PKCE flow requires a browser on this machine.`
      : `Complete the sign-in flow in your browser. The page should have opened automatically.`,
    method: 'auto' as const,
    url: authUrl.toString(),
  };
}

/**
 * Generate code_challenge from code_verifier using S256 method
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate a random string for PKCE code_verifier
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Handles the OAuth callback request
 */
async function handleCallbackRequest(
  response: http.ServerResponse,
  server: http.Server,
  parsedUrl: url.UrlWithParsedQuery,
  state: string,
  codeVerifier: string,
  redirectUri: string,
  resolve: (value: AuthOAuthResult | PromiseLike<AuthOAuthResult>) => void,
): Promise<void> {
  const receivedState = parsedUrl.query.state as string;
  const code = parsedUrl.query.code as string;
  const error = parsedUrl.query.error as string;

  if (error) {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(buildHtmlResponse(false, error));
    server.close();
    resolve({
      error: `Authentication failed: ${error}`,
      type: 'failed',
    });
    return;
  }

  if (receivedState !== state) {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(buildHtmlResponse(false, 'Invalid state parameter'));
    server.close();
    resolve({
      error: 'Invalid state parameter. Please try again.',
      type: 'failed',
    });
    return;
  }

  if (!code) {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(buildHtmlResponse(false, 'No authorization code received'));
    server.close();
    resolve({
      error: 'No authorization code received.',
      type: 'failed',
    });
    return;
  }

  // Exchange code for tokens
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(buildHtmlResponse(true, 'You can close this window and return to OpenCode.'));
  server.close();

  const result = await exchangeCodeForTokens(code, codeVerifier, redirectUri);
  resolve(result);
}

/**
 * Handles server startup errors
 */
function handleServerError(
  error: NodeJS.ErrnoException,
  resolve: (value: AuthOAuthResult | PromiseLike<AuthOAuthResult>) => void,
): void {
  if (error.code === 'EADDRINUSE') {
    logDebug(`Port ${PKCE_CALLBACK_PORT} is already in use`);
    resolve({
      error: `Port ${PKCE_CALLBACK_PORT} is already in use. Please close other applications using this port.`,
      type: 'failed',
    });
    return;
  }

  logDebug(`Server error: ${error.message}`);
  resolve({
    error: `Failed to start callback server: ${error.message}`,
    type: 'failed',
  });
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
 * Opens a URL in the user's default browser
 */
function openBrowserUrl(urlString: string): void {
  try {
    const platform = process.platform;
    let command: string;
    let arguments_: string[];

    if (platform === 'darwin') {
      command = 'open';
      arguments_ = [urlString];
    } else if (platform === 'win32') {
      command = 'rundll32';
      arguments_ = ['url.dll,FileProtocolHandler', urlString];
    } else {
      command = 'xdg-open';
      arguments_ = [urlString];
    }

    const child = spawn(command, arguments_, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref?.();

    logDebug(`Opened browser with command: ${command}`);
  } catch (error) {
    logDebug(`Failed to open browser: ${error}`);
  }
}
