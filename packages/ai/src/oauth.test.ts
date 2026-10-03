import { describe, expect, it } from 'vitest';
import { loginAnthropic, loginOpenAICodexDeviceCode, refreshOpenAICodexToken } from './oauth.js';

describe('@dome/ai/oauth runtime exports', () => {
  it('exposes the Codex and Claude login functions Electron imports', () => {
    expect(typeof loginOpenAICodexDeviceCode).toBe('function');
    expect(typeof refreshOpenAICodexToken).toBe('function');
    expect(typeof loginAnthropic).toBe('function');
  });
});
