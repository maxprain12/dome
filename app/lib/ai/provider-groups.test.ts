import { describe, expect, it } from 'vitest';
import type { ProviderOption } from './provider-options';
import { groupProviderOptions, providerKind } from './provider-groups';

const option = (value: ProviderOption['value'], label: string, disabled = false): ProviderOption => ({
  value,
  label,
  description: '',
  disabled,
});

const OPTIONS = [
  option('dome', 'Dome'),
  option('openai', 'OpenAI'),
  option('anthropic', 'Anthropic'),
  option('copilot', 'GitHub Copilot'),
  option('minimax', 'MiniMax'),
  option('ollama', 'Ollama'),
  option('groq', 'Groq', true),
];

const keysOf = (groups: ReturnType<typeof groupProviderOptions>) =>
  groups.map((g) => [g.key, g.options.map((o) => o.value)]);

describe('groupProviderOptions', () => {
  it('puts the active provider first and each provider in exactly one group', () => {
    const groups = groupProviderOptions({
      active: 'minimax',
      configured: { minimax: true, openai: true, copilot: false },
      options: OPTIONS,
    });
    expect(keysOf(groups)).toEqual([
      ['active', ['minimax']],
      ['configured', ['openai']],
      ['subscription', ['dome', 'copilot']],
      ['cloud', ['anthropic']],
      ['local', ['ollama']],
    ]);
  });

  it('filters by name or id, hides disabled and optionally Dome', () => {
    const groups = groupProviderOptions({
      active: null,
      configured: {},
      query: 'co',
      hideDome: true,
      options: OPTIONS,
    });
    expect(keysOf(groups)).toEqual([['subscription', ['copilot']]]);
  });

  it('returns no groups when nothing matches', () => {
    expect(groupProviderOptions({ active: null, configured: {}, query: 'zzz', options: OPTIONS })).toEqual([]);
  });
});

describe('providerKind', () => {
  it('classifies subscription, local and API-key providers', () => {
    expect(providerKind('claude-oauth')).toBe('subscription');
    expect(providerKind('lmstudio')).toBe('local');
    expect(providerKind('mistral')).toBe('cloud');
  });
});
