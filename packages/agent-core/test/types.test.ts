import { describe, it, expect } from 'vitest';
import * as AgentCore from '../src/index.js';

describe('@dome/agent-core barrel', () => {
  it('exports createAgent', () => {
    expect(typeof AgentCore.createAgent).toBe('function');
  });

  it('createAgent returns an agent handle', () => {
    const agent = AgentCore.createAgent({});
    expect(typeof agent.prompt).toBe('function');
    expect(typeof agent.continue).toBe('function');
  });

  it('package.json metadata is correct', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default.name).toBe('@dome/agent-core');
  });
});
