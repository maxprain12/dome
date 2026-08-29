import { describe, expect, it } from 'vitest';
import {
  buildAISaveConfig,
  formatTokens,
  parseLoadedAIConfig,
} from './aiSectionHelpers';
import type { AISettings } from '@/types';

describe('aiSectionHelpers', () => {
  it('formatTokens scales K/M thresholds', () => {
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(12_000)).toBe('12K');
    expect(formatTokens(1_500_000)).toBe('1.5M');
  });

  it('parseLoadedAIConfig remaps local→ollama and dome-safe models', () => {
    const loaded = parseLoadedAIConfig({
      provider: 'local',
      model: 'llama3.2',
      api_key: '',
      ollama_base_url: 'http://localhost:11434',
      ollama_model: 'llama3.2',
    } as unknown as AISettings);
    expect(loaded.provider).toBe('ollama');
    // llama3.2 is not in the static Ollama catalog → treated as custom (same as before).
    expect(loaded.customModel).toBe(true);

    const withSlash = parseLoadedAIConfig({
      provider: 'openai',
      model: 'openai/gpt-5.6-sol',
      api_key: 'k',
    } as unknown as AISettings);
    expect(withSlash.provider).toBe('openai');
    expect(withSlash.model).toBe('openai/gpt-5.6-sol');
    expect(withSlash.customModel).toBe(true);
  });

  it('buildAISaveConfig branches per provider', () => {
    expect(
      buildAISaveConfig({
        provider: 'dome',
        model: '',
        apiKey: 'x',
        ollamaBaseURL: '',
        ollamaModel: '',
        ollamaApiKey: '',
      }),
    ).toEqual({ provider: 'dome', model: 'dome/auto', base_url: '' });

    expect(
      buildAISaveConfig({
        provider: 'ollama',
        model: '',
        apiKey: '',
        ollamaBaseURL: 'http://h',
        ollamaModel: 'm',
        ollamaApiKey: 'k',
      }),
    ).toEqual({
      provider: 'ollama',
      ollama_base_url: 'http://h',
      ollama_model: 'm',
      ollama_api_key: 'k',
    });

    expect(
      buildAISaveConfig({
        provider: 'openai',
        model: 'gpt-5.6-sol',
        apiKey: 'sk',
        ollamaBaseURL: '',
        ollamaModel: '',
        ollamaApiKey: '',
      }),
    ).toEqual({ provider: 'openai', api_key: 'sk', model: 'gpt-5.6-sol', base_url: '' });
  });
});
