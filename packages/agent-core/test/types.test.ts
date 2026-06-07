import { describe, it, expect } from 'vitest';
import * as AgentCore from '../src/index.js';

describe('@dome/agent-core barrel', () => {
  it('exports the Agent class', () => {
    expect(typeof AgentCore.Agent).toBe('function');
  });

  it('exports the low-level loop functions', () => {
    expect(typeof AgentCore.runAgentLoop).toBe('function');
    expect(typeof AgentCore.agentLoop).toBe('function');
  });

  it('package.json metadata is correct', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default.name).toBe('@dome/agent-core');
  });
});
