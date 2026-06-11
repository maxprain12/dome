import { describe, it, expect } from 'vitest';
import * as agentCore from '../src/index.js';

describe('@dome/agent-core exports', () => {
  it('exposes runAgentLoop', () => {
    expect(typeof agentCore.runAgentLoop).toBe('function');
  });

  it('exposes formatSkillsForSystemPrompt', () => {
    expect(typeof agentCore.formatSkillsForSystemPrompt).toBe('function');
  });

  it('exposes loadSkills', () => {
    expect(typeof agentCore.loadSkills).toBe('function');
  });
});
