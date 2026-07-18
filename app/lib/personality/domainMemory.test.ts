import { describe, expect, it } from 'vitest';
import { resolveMemoryDomains } from './domainMemory';

describe('resolveMemoryDomains', () => {
  it('includes social from shell tab', () => {
    expect(resolveMemoryDomains({ shellTabType: 'social' })).toEqual(['social']);
  });

  it('includes email from tool names without social tab', () => {
    expect(resolveMemoryDomains({ toolNames: ['email_list', 'email_send'] })).toEqual(['email']);
  });

  it('merges tab + tools', () => {
    expect(
      resolveMemoryDomains({
        shellTabType: 'social',
        toolNames: ['email_search'],
      }).sort(),
    ).toEqual(['email', 'social']);
  });

  it('returns empty when unrelated', () => {
    expect(resolveMemoryDomains({ shellTabType: 'note', toolNames: ['resource_get'] })).toEqual([]);
  });
});
