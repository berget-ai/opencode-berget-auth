/**
 * Type definitions for Berget Auth Plugin
 * Based on @opencode-ai/plugin types
 */

import type { ToolDefinition } from '@opencode-ai/plugin';
import type { Auth, Config, createOpencodeClient, Provider } from '@opencode-ai/sdk';

export type AuthDetails = NonOAuthAuthDetails | OAuthAuthDetails;

/**
 * OAuth authentication result
 */
export type AuthOAuthResult =
  | {
      access: string;
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
 * OAuth auth details from OpenCode storage
 */
export interface OAuthAuthDetails {
  access?: string;
  expires?: number;
  refresh: string;
  type: 'oauth';
}

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
 * Auth hook method - API key type
 */
interface ApiAuthMethod {
  authorize?(): Promise<{ key: string; type: 'success' } | { type: 'failed' }>;
  label: string;
  type: 'api';
}

/**
 * Auth hook for plugin
 */
interface AuthHook {
  loader?: (auth: () => Promise<Auth>, provider: Provider) => Promise<Record<string, unknown>>;
  methods: AuthMethod[];
  provider: string;
}

type AuthMethod = ApiAuthMethod | OAuthAuthMethod;

/**
 * Non-OAuth auth details
 */
interface NonOAuthAuthDetails {
  [key: string]: unknown;
  type: string;
}

/**
 * Auth hook method - OAuth type
 */
interface OAuthAuthMethod {
  authorize(): Promise<AuthorizeResult>;
  label: string;
  type: 'oauth';
}
