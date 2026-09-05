import { describe, expect, it } from 'vitest';
import {
  buildAISaveConfig,
  formatTokens,
  parseLoadedAIConfig,
} from './aiSectionHelpers';
import { pickProviderBaseUrl } from '@/lib/ai/models';
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
        localCompatBaseURL: '',
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
        localCompatBaseURL: '',
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
        localCompatBaseURL: '',
      }),
    ).toEqual({ provider: 'openai', api_key: 'sk', model: 'gpt-5.6-sol', base_url: '' });

    expect(
      buildAISaveConfig({
        provider: 'vllm',
        model: 'meta-llama/Llama-3',
        apiKey: '',
        ollamaBaseURL: '',
        ollamaModel: '',
        ollamaApiKey: '',
        localCompatBaseURL: 'http://127.0.0.1:8000/v1',
      }),
    ).toEqual({
      provider: 'vllm',
      api_key: '',
      model: 'meta-llama/Llama-3',
      base_url: 'http://127.0.0.1:8000/v1',
    });

    expect(
      buildAISaveConfig({
        provider: 'lmstudio',
        model: 'loaded-model',
        apiKey: 'optional',
        ollamaBaseURL: '',
        ollamaModel: '',
        ollamaApiKey: '',
        localCompatBaseURL: '',
      }),
    ).toEqual({
      provider: 'lmstudio',
      api_key: 'optional',
      model: 'loaded-model',
      base_url: 'http://127.0.0.1:1234/v1',
    });

    expect(
      buildAISaveConfig({
        provider: 'minimax',
        model: 'MiniMax-M3',
        apiKey: 'mm',
        ollamaBaseURL: '',
        ollamaModel: '',
        ollamaApiKey: '',
        localCompatBaseURL: 'http://127.0.0.1:1234/v1',
      }),
    ).toEqual({
      provider: 'minimax',
      api_key: 'mm',
      model: 'MiniMax-M3',
      base_url: '',
    });
  });
});

describe('pickProviderBaseUrl', () => {
  it('ignores a leftover localhost shared URL for MiniMax', () => {
    expect(pickProviderBaseUrl('minimax', '', 'http://127.0.0.1:1234/v1')).toBeUndefined();
    expect(pickProviderBaseUrl('minimax', null, 'http://localhost:1234/v1')).toBeUndefined();
  });

  it('keeps a per-provider slot and a non-loopback shared URL', () => {
    expect(pickProviderBaseUrl('minimax', 'https://api.minimax.io/anthropic', 'http://127.0.0.1:1234/v1')).toBe(
      'https://api.minimax.io/anthropic',
    );
    expect(pickProviderBaseUrl('openrouter', '', 'https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1',
    );
  });

  it('lets local providers inherit a shared localhost URL', () => {
    expect(pickProviderBaseUrl('lmstudio', '', 'http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1');
    expect(pickProviderBaseUrl('vllm', '', 'http://127.0.0.1:8000/v1')).toBe('http://127.0.0.1:8000/v1');
  });
});
