import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logDebug, logError } from './debug';

describe('logDebug', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not output anything when debug mode is disabled', () => {
    vi.stubEnv('OPENCODE_BERGET_DEBUG', '0');
    logDebug('test message');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('outputs message when OPENCODE_BERGET_DEBUG is set to "1"', () => {
    vi.stubEnv('OPENCODE_BERGET_DEBUG', '1');
    logDebug('test message');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[Berget Auth \d{4}-\d{2}-\d{2}T.*\] test message/),
    );
  });

  it('outputs message when OPENCODE_BERGET_DEBUG is set to "true"', () => {
    vi.stubEnv('OPENCODE_BERGET_DEBUG', 'true');
    logDebug('another message');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('outputs message when DEBUG env includes "berget"', () => {
    vi.stubEnv('DEBUG', 'berget,other');
    logDebug('debug via DEBUG env');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('does not output when DEBUG is set but does not include "berget"', () => {
    vi.stubEnv('DEBUG', 'other');
    logDebug('should not appear');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});

describe('logError', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs message without "undefined" when called with one argument', () => {
    logError('Token refresh failed');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const call = consoleErrorSpy.mock.calls[0];
    expect(call).toHaveLength(1);
    expect(call[0]).toMatch(/\[Berget Auth .*\] ERROR: Token refresh failed/);
    expect(call[0]).not.toMatch(/undefined/);
  });

  it('includes Error.message when passed an Error object', () => {
    const error = new Error('Network timeout');
    logError('Token refresh failed', error);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const call = consoleErrorSpy.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toMatch(/\[Berget Auth .*\] ERROR: Token refresh failed/);
    expect(call[1]).toBe('Network timeout');
  });

  it('includes the string when passed a string error', () => {
    logError('Token refresh failed', 'rate limited');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const call = consoleErrorSpy.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[1]).toBe('rate limited');
  });

  it('includes a number when passed a numeric error', () => {
    logError('Token refresh failed', 503);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const call = consoleErrorSpy.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[1]).toBe('503');
  });

  it('formats null correctly when passed explicitly', () => {
    // eslint-disable-next-line unicorn/no-null
    logError('Token refresh failed', null);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const call = consoleErrorSpy.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[1]).toBe('null');
  });
});
