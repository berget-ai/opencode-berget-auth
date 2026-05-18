/**
 * Type definitions for Berget Auth Plugin
 * Based on @opencode-ai/plugin types
 */

import type { ToolDefinition } from '@opencode-ai/plugin';
import type { Auth, Config, createOpencodeClient, Provider } from '@opencode-ai/sdk';

/**
 * Auth hook method - API key type
 */
export interface ApiAuthMethod {
  authorize?(): Promise<{ key: string; type: 'success' } | { type: 'failed' }>;
  label: string;
  type: 'api';
}

export type AuthDetails = NonOAuthAuthDetails | OAuthAuthDetails;

/**
 * Auth hook for plugin
 */
export interface AuthHook {
  loader?: (auth: () => Promise<Auth>, provider: Provider) => Promise<Record<string, unknown>>;
  methods: AuthMethod[];
  provider: string;
}

export type AuthMethod = ApiAuthMethod | OAuthAuthMethod;

/**
 * OAuth authentication result
 */
export type AuthOAuthResult =
  | {
      access: string;
      accountId?: string;
      expires: number;
      provider?: string;
      refresh: string;
      type: 'success';
    }
  | {
      error?: string;
      type: 'failed';
    }
  | {
      key: string;
      provider?: string;
      type: 'success';
    };

/**
 * OAuth authorize callback result
 */
export interface AuthorizeResult {
  callback: (() => Promise<AuthOAuthResult>) | ((code: string) => Promise<AuthOAuthResult>);
  instructions: string;
  method: 'auto' | 'code';
  url: string;
}

/**
 * Berget user info
 */
export interface BergetUser {
  email: string;
  id: string;
  name?: string;
  organizations?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

/**
 * Plugin hooks result
 */
export interface Hooks {
  auth?: AuthHook;
  config?: (input: Config) => Promise<void>;
  tool?: Record<string, ToolDefinition>;
}

/**
 * Non-OAuth auth details
 */
export interface NonOAuthAuthDetails {
  [key: string]: unknown;
  type: string;
}

/**
 * OAuth auth details from OpenCode storage
 */
export interface OAuthAuthDetails {
  access?: string;
  expires?: number;
  refresh: string;
  type: 'oauth';
}

/**
 * Auth hook method - OAuth type
 */
export interface OAuthAuthMethod {
  authorize(): Promise<AuthorizeResult>;
  label: string;
  type: 'oauth';
}

/**
 * Plugin function type
 */
export type Plugin = (input: PluginInput) => Promise<Hooks>;

/**
 * Plugin input from OpenCode
 */
export interface PluginInput {
  client: ReturnType<typeof createOpencodeClient>;
  directory: string;
  project: { id: string; path: string };
  serverUrl: URL;
  worktree: string;
}

/**
 * Result of a token refresh attempt
 */
export type RefreshResult =
  | { auth: OAuthAuthDetails; success: true }
  | { reason: string; success: false };

/**
 * Token refresh response
 */
export interface TokenRefreshResponse {
  expires_in: number;
  refresh_token?: string;
  token: string;
}
