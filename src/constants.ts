/**
 * Berget AI OpenCode Auth Plugin Constants
 *
 * URL getters read env vars at runtime to support:
 *   BERGET_API_URL=https://api.stage.berget.ai opencode
 */

// Provider identifier for OpenCode
export const BERGET_PROVIDER_ID = "berget";

// Runtime getters for URL configuration
export const getApiUrl = () =>
  process.env.BERGET_API_URL || "https://api.berget.ai";

export const getInferenceUrl = () =>
  process.env.BERGET_INFERENCE_URL || "https://api.berget.ai/v1";

export const getKeycloakUrl = () =>
  process.env.BERGET_KEYCLOAK_URL || "https://keycloak.berget.ai";

export const getKeycloakRealm = () =>
  process.env.BERGET_KEYCLOAK_REALM || "berget";

export const getKeycloakClientId = () =>
  process.env.BERGET_KEYCLOAK_CLIENT_ID || "berget-code";

// Device flow endpoints
export const getDeviceAuthEndpoint = () => `${getApiUrl()}/v1/auth/device`;
export const getDeviceTokenEndpoint = () => `${getApiUrl()}/v1/auth/device/token`;
export const getTokenRefreshEndpoint = () => `${getApiUrl()}/v1/auth/refresh`;

// Keycloak endpoints (fallback)
export const getKeycloakDeviceEndpoint = () =>
  `${getKeycloakUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/auth/device`;
export const getKeycloakTokenEndpoint = () =>
  `${getKeycloakUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/token`;

// Token expiry buffer (refresh tokens 1 minute before expiry)
export const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

// Device flow polling settings
export const DEVICE_POLL_INTERVAL_MS = 5000;
export const DEVICE_POLL_MAX_ATTEMPTS = 60; // 5 minutes max wait
