import { describe, expect, it } from 'vitest';
import { isTrustedArtifactMessageOrigin } from './artifactIframeNavigate';

describe('isTrustedArtifactMessageOrigin', () => {
  it('accepts opaque srcdoc origins and app://artifact', () => {
    expect(isTrustedArtifactMessageOrigin('null')).toBe(true);
    expect(isTrustedArtifactMessageOrigin('app://artifact')).toBe(true);
  });

  it('rejects other origins', () => {
    expect(isTrustedArtifactMessageOrigin('https://evil.example')).toBe(false);
    expect(isTrustedArtifactMessageOrigin('http://localhost:5173')).toBe(false);
  });
});
