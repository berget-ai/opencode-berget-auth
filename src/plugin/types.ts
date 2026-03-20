/**
 * Type definitions for Berget Auth Plugin
 * Based on @opencode-ai/plugin types
 */

import type {
  Config,
  Auth,
  Provider,
  createOpencodeClient,
} from "@opencode-ai/sdk";
import type { ToolDefinition } from "@opencode-ai/plugin";

/**
 * Plugin input from OpenCode
 */
export interface PluginInput {
  client: ReturnType<typeof createOpencodeClient>;
  project: { id: string; path: string };
  directory: string;
  worktree: string;
  serverUrl: URL;
}

/**
 * OAuth authentication result
 */
export type AuthOAuthResult =
  | {
      type: "success";
      provider?: string;
      refresh: string;
      access: string;
      expires: number;
      accountId?: string;
    }
  | {
      type: "success";
      provider?: string;
      key: string;
    }
  | {
      type: "failed";
      error?: string;
    };

/**
 * OAuth authorize callback result
 */
export interface AuthorizeResult {
  url: string;
  instructions: string;
  method: "auto" | "code";
  callback:
    | (() => Promise<AuthOAuthResult>)
    | ((code: string) => Promise<AuthOAuthResult>);
}

/**
 * Auth hook method - OAuth type
 */
export interface OAuthAuthMethod {
  type: "oauth";
  label: string;
  authorize(): Promise<AuthorizeResult>;
}

/**
 * Auth hook method - API key type
 */
export interface ApiAuthMethod {
  type: "api";
  label: string;
  authorize?(): Promise<{ type: "success"; key: string } | { type: "failed" }>;
}

export type AuthMethod = OAuthAuthMethod | ApiAuthMethod;

/**
 * Auth hook for plugin
 */
export interface AuthHook {
  provider: string;
  loader?: (
    auth: () => Promise<Auth>,
    provider: Provider
  ) => Promise<Record<string, unknown>>;
  methods: AuthMethod[];
}

/**
 * Plugin hooks result
 */
export interface Hooks {
  config?: (input: Config) => Promise<void>;
  tool?: Record<string, ToolDefinition>;
  auth?: AuthHook;
}

/**
 * Plugin function type
 */
export type Plugin = (input: PluginInput) => Promise<Hooks>;

/**
 * Device authorization response from Berget API
 */
export interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

/**
 * Device token polling response
 */
export interface DeviceTokenResponse {
  token?: string;
  refresh_token?: string;
  expires_in?: number;
  pending?: boolean;
  error?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

/**
 * Token refresh response
 */
export interface TokenRefreshResponse {
  token: string;
  refresh_token?: string;
  expires_in: number;
}

/**
 * Berget user info
 */
export interface BergetUser {
  id: string;
  email: string;
  name?: string;
  organizations?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

/**
 * OAuth auth details from OpenCode storage
 */
export interface OAuthAuthDetails {
  type: "oauth";
  refresh: string;
  access?: string;
  expires?: number;
}

/**
 * Non-OAuth auth details
 */
export interface NonOAuthAuthDetails {
  type: string;
  [key: string]: unknown;
}

export type AuthDetails = OAuthAuthDetails | NonOAuthAuthDetails;
