/**
 * Berget AI OpenCode Auth Plugin Constants
 */

// Provider identifier for OpenCode
export const BERGET_PROVIDER_ID = "berget";

// Berget API endpoints
export const BERGET_API_URL =
  process.env.BERGET_API_URL || "https://api.berget.ai";

// Keycloak configuration for Berget
export const KEYCLOAK_URL =
  process.env.BERGET_KEYCLOAK_URL || "https://keycloak.berget.ai";
export const KEYCLOAK_REALM = process.env.BERGET_KEYCLOAK_REALM || "berget";
export const KEYCLOAK_CLIENT_ID =
  process.env.BERGET_KEYCLOAK_CLIENT_ID || "berget-code";

// Device flow endpoints (via Berget API proxy)
export const DEVICE_AUTH_ENDPOINT = `${BERGET_API_URL}/v1/auth/device`;
export const DEVICE_TOKEN_ENDPOINT = `${BERGET_API_URL}/v1/auth/device/token`;
export const TOKEN_REFRESH_ENDPOINT = `${BERGET_API_URL}/v1/auth/refresh`;

// Direct Keycloak endpoints (fallback)
export const KEYCLOAK_DEVICE_ENDPOINT = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth/device`;
export const KEYCLOAK_TOKEN_ENDPOINT = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

// Berget inference endpoint
export const BERGET_INFERENCE_URL =
  process.env.BERGET_INFERENCE_URL || "https://api.berget.ai/v1";

// Token expiry buffer (refresh tokens 1 minute before expiry)
export const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

// Device flow polling settings
export const DEVICE_POLL_INTERVAL_MS = 5000;
export const DEVICE_POLL_MAX_ATTEMPTS = 60; // 5 minutes max wait
