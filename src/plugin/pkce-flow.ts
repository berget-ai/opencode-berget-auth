/**
 * PKCE Authorization Flow implementation for Berget
 * Based on RFC 7636 - Proof Key for Code Exchange
 * 
 * This flow is preferred for desktop environments where a local
 * callback server can be started. It works better with magic link
 * authentication than device flow.
 */

import { spawn } from "node:child_process";
import * as http from "node:http";
import * as crypto from "node:crypto";
import * as url from "node:url";
import { getKeycloakUrl, getKeycloakRealm, KEYCLOAK_CLIENT_ID, PKCE_CALLBACK_PORT } from "../constants";
import { logDebug } from "./debug";
import type { AuthorizeResult, AuthOAuthResult } from "./types";

/**
 * Generate a random string for PKCE code_verifier
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate code_challenge from code_verifier using S256 method
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
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
 * Exchanges authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<AuthOAuthResult> {
  const tokenUrl = `${getKeycloakUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/token`;
  
  logDebug(`Exchanging code for tokens at ${tokenUrl}`);
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: KEYCLOAK_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logDebug(`Token exchange failed: ${errorText}`);
    return {
      type: "failed",
      error: `Failed to exchange code for tokens: ${errorText}`,
    };
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expires = Date.now() + tokenData.expires_in * 1000;

  logDebug("Successfully obtained tokens via PKCE");

  return {
    type: "success",
    access: tokenData.access_token,
    refresh: tokenData.refresh_token,
    expires,
  };
}

/**
 * Creates the OAuth authorize method using PKCE flow
 * This is called when user selects "Login with Berget" in OpenCode
 */
export function createPkceAuthorizeMethod(): () => Promise<AuthorizeResult> {
  return async (): Promise<AuthorizeResult> => {
    const isHeadless = isHeadlessEnvironment();

    if (isHeadless) {
      logDebug("Headless environment detected - PKCE flow may not work");
      // In headless mode, we could fall back to device flow
      // For now, we'll still try PKCE but warn the user
    }

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString("hex");
    const redirectUri = `http://localhost:${PKCE_CALLBACK_PORT}/callback`;

    // Build authorization URL
    const authUrl = new URL(
      `${getKeycloakUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/auth`
    );
    authUrl.searchParams.set("client_id", KEYCLOAK_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    logDebug(`Authorization URL: ${authUrl.toString()}`);

    // Open browser
    if (!isHeadless) {
      openBrowserUrl(authUrl.toString());
    }

    return {
      url: authUrl.toString(),
      instructions: isHeadless
        ? `Open the URL above in your browser to sign in.\n\nNote: PKCE flow requires a browser on this machine.`
        : `Complete the sign-in flow in your browser. The page should have opened automatically.`,
      method: "auto" as const,
      callback: async (): Promise<AuthOAuthResult> => {
        return new Promise((resolve) => {
          const server = http.createServer(async (req, res) => {
            const parsedUrl = url.parse(req.url || "", true);

            if (parsedUrl.pathname === "/callback") {
              const receivedState = parsedUrl.query.state as string;
              const code = parsedUrl.query.code as string;
              const error = parsedUrl.query.error as string;

              // Send response to browser
              const htmlResponse = (success: boolean, message: string) => `
                <!DOCTYPE html>
                <html lang="en">
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Berget - ${success ? "Authentication Successful" : "Authentication Failed"}</title>
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
                        background: ${success 
                          ? "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)" 
                          : "linear-gradient(135deg, #f87171 0%, #ef4444 100%)"};
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 1.5rem;
                        box-shadow: 0 4px 20px ${success ? "rgba(74, 222, 128, 0.3)" : "rgba(248, 113, 113, 0.3)"};
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
                      <div class="icon">
                        ${success 
                          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>`
                          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
                        }
                      </div>
                      <h1>${success ? "Authentication Successful" : "Authentication Failed"}</h1>
                      <p>${message}</p>
                      <div class="brand">BERGET</div>
                    </div>
                  </body>
                </html>
              `;

              if (error) {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(htmlResponse(false, error));
                server.close();
                resolve({
                  type: "failed",
                  error: `Authentication failed: ${error}`,
                });
                return;
              }

              if (receivedState !== state) {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(htmlResponse(false, "Invalid state parameter"));
                server.close();
                resolve({
                  type: "failed",
                  error: "Invalid state parameter. Please try again.",
                });
                return;
              }

              if (!code) {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(htmlResponse(false, "No authorization code received"));
                server.close();
                resolve({
                  type: "failed",
                  error: "No authorization code received.",
                });
                return;
              }

              // Exchange code for tokens
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(htmlResponse(true, "You can close this window and return to OpenCode."));
              server.close();

              const result = await exchangeCodeForTokens(code, codeVerifier, redirectUri);
              resolve(result);
            }
          });

          server.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
              logDebug(`Port ${PKCE_CALLBACK_PORT} is already in use`);
              resolve({
                type: "failed",
                error: `Port ${PKCE_CALLBACK_PORT} is already in use. Please close other applications using this port.`,
              });
            } else {
              logDebug(`Server error: ${err.message}`);
              resolve({
                type: "failed",
                error: `Failed to start callback server: ${err.message}`,
              });
            }
          });

          server.listen(PKCE_CALLBACK_PORT, () => {
            logDebug(`Callback server listening on port ${PKCE_CALLBACK_PORT}`);
          });

          // Timeout after 5 minutes
          setTimeout(() => {
            server.close();
            resolve({
              type: "failed",
              error: "Authentication timed out. Please try again.",
            });
          }, 5 * 60 * 1000);
        });
      },
    };
  };
}
