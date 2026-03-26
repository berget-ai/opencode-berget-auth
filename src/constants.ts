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

// Device flow endpoints (all auth goes through API, not direct to Keycloak)
export const getDeviceAuthEndpoint = () => `${getApiUrl()}/v1/auth/device`;
export const getDeviceTokenEndpoint = () => `${getApiUrl()}/v1/auth/device/token`;
export const getTokenRefreshEndpoint = () => `${getApiUrl()}/v1/auth/refresh`;

// Model discovery endpoint (chat models only, excludes embeddings/rerankers/whisper)
export const getModelsEndpoint = () => `${getApiUrl()}/v1/models/chat`;

// Token expiry buffer (refresh tokens 1 minute before expiry)
export const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

// Device flow polling settings
export const DEVICE_POLL_INTERVAL_MS = 5000;
export const DEVICE_POLL_MAX_ATTEMPTS = 60; // 5 minutes max wait

// PKCE flow settings
export const PKCE_CALLBACK_PORT = 8787;
export const KEYCLOAK_CLIENT_ID = "berget-code";

// Keycloak URL getters (derived from API URL)
export const getKeycloakUrl = () => {
  const apiUrl = getApiUrl();
  if (apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1")) {
    return "https://keycloak.stage.berget.ai"; // Local dev uses stage Keycloak
  }
  if (apiUrl.includes("stage")) {
    return "https://keycloak.stage.berget.ai";
  }
  return "https://keycloak.berget.ai";
};

export const getKeycloakRealm = () => "berget";
