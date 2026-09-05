import { describe, expect, it } from 'vitest';
import {
  domeUsageToLegacy,
  extractTextFromAssistantMessage,
  legacyUsageToDome,
  resolveDomeModel,
} from './dome-bridge.js';
import type { AssistantMessage, Usage } from './types.js';

describe('resolveDomeModel', () => {
  it('defaults empty model id to gpt-4o-mini (catalog when known)', () => {
    const m = resolveDomeModel({ provider: 'openai', model: '' });
    expect(m.id).toBe('gpt-4o-mini');
    expect(m.provider).toBe('openai');
    // Catalog entry uses Responses API; custom ids fall back to completions.
    expect(m.api === 'openai-responses' || m.api === 'openai-completions').toBe(true);
  });

  it('uses custom openai baseUrl when not in catalog', () => {
    const m = resolveDomeModel({
      provider: 'openai',
      model: 'totally-custom-model-xyz',
      baseUrl: 'https://example.test/v1',
    });
    expect(m).toMatchObject({
      id: 'totally-custom-model-xyz',
      api: 'openai-completions',
      provider: 'openai',
      baseUrl: 'https://example.test/v1',
    });
  });

  it('maps anthropic and claude-oauth to anthropic-messages', () => {
    const a = resolveDomeModel({ provider: 'anthropic', model: 'claude-sonnet-4-5' });
    const o = resolveDomeModel({ provider: 'claude-oauth', model: 'claude-sonnet-4-5' });
    expect(a.api).toBe('anthropic-messages');
    expect(o.api).toBe('anthropic-messages');
    expect(a.provider).toBe('anthropic');
    expect(o.provider).toBe('anthropic');
  });

  it('builds openai-codex fallback and applies optional baseUrl', () => {
    const fallback = resolveDomeModel({
      provider: 'openai-codex',
      model: 'codex-unlisted-model',
    });
    expect(fallback).toMatchObject({
      id: 'codex-unlisted-model',
      api: 'openai-codex-responses',
      provider: 'openai-codex',
      baseUrl: 'https://chatgpt.com/backend-api',
      reasoning: true,
      maxTokens: 128_000,
    });

    const withUrl = resolveDomeModel({
      provider: 'openai-codex',
      model: 'codex-unlisted-model',
      baseUrl: 'https://codex.test',
    });
    expect(withUrl.baseUrl).toBe('https://codex.test');
  });

  it('normalizes ollama baseUrl to …/v1', () => {
    expect(resolveDomeModel({ provider: 'ollama', model: 'llama3' }).baseUrl).toBe(
      'http://127.0.0.1:11434/v1',
    );
    expect(
      resolveDomeModel({ provider: 'ollama', model: 'llama3', baseUrl: 'http://host:11434' }).baseUrl,
    ).toBe('http://host:11434/v1');
    expect(
      resolveDomeModel({
        provider: 'ollama',
        model: 'llama3',
        baseUrl: 'http://host:11434/',
      }).baseUrl,
    ).toBe('http://host:11434/v1');
    expect(
      resolveDomeModel({
        provider: 'ollama',
        model: 'llama3',
        baseUrl: 'http://host:11434/v1',
      }).baseUrl,
    ).toBe('http://host:11434/v1');

    const m = resolveDomeModel({ provider: 'ollama', model: 'llama3' });
    expect(m.api).toBe('openai-completions');
    expect(m.provider).toBe('ollama');
    expect(m.contextWindow).toBe(32_768);
    expect(m.compat).toEqual({ supportsUsageInStreaming: false, supportsStore: false });
  });

  it('applies a persisted contextWindow override', () => {
    const m = resolveDomeModel({
      provider: 'lmstudio',
      model: 'qwen2.5-7b-instruct',
      contextWindow: 4096,
    });
    expect(m.contextWindow).toBe(4096);
  });

  it('resolves openrouter, copilot, minimax, and dome providers', () => {
    const or = resolveDomeModel({
      provider: 'openrouter',
      model: 'openrouter-unlisted/x',
    });
    expect(or).toMatchObject({
      api: 'openai-completions',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      compat: { thinkingFormat: 'openrouter' },
    });

    const copilot = resolveDomeModel({
      provider: 'copilot',
      model: 'copilot-unlisted',
    });
    expect(copilot).toMatchObject({
      api: 'openai-responses',
      provider: 'github-copilot',
      baseUrl: 'https://api.githubcopilot.com',
      input: ['text'],
    });

    const minimax = resolveDomeModel({ provider: 'minimax', model: 'MiniMax-M3' });
    expect(minimax).toMatchObject({
      api: 'anthropic-messages',
      provider: 'minimax',
      baseUrl: 'https://api.minimax.io/anthropic',
      maxTokens: 16_384,
    });

    // Empty model becomes gpt-4o-mini before the dome helper (same as legacy).
    const domeEmpty = resolveDomeModel({ provider: 'dome', model: '' });
    expect(domeEmpty).toMatchObject({
      id: 'gpt-4o-mini',
      api: 'openai-completions',
      provider: 'minimax',
      baseUrl: 'https://api.minimax.io/v1',
      compat: {
        supportsUsageInStreaming: true,
        supportsStore: false,
        maxTokensField: 'max_tokens',
      },
    });
    const domeNamed = resolveDomeModel({ provider: 'dome', model: 'dome/auto' });
    expect(domeNamed.id).toBe('dome/auto');
  });

  it('resolves deepseek, moonshot, qwen, opencode family, google, and unknown default', () => {
    expect(resolveDomeModel({ provider: 'deepseek', model: 'deepseek-chat' })).toMatchObject({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      api: 'openai-completions',
    });
    expect(resolveDomeModel({ provider: 'moonshot', model: 'kimi' })).toMatchObject({
      provider: 'moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
    });
    expect(resolveDomeModel({ provider: 'qwen', model: 'qwen-max' })).toMatchObject({
      provider: 'qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    expect(
      resolveDomeModel({ provider: 'opencode', model: 'opencode-unlisted' }),
    ).toMatchObject({
      provider: 'opencode',
      baseUrl: 'https://opencode.ai/zen/v1',
    });
    expect(
      resolveDomeModel({ provider: 'opencode-go', model: 'opencode-go-unlisted' }),
    ).toMatchObject({
      provider: 'opencode-go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
    });

    const google = resolveDomeModel({ provider: 'google', model: 'gemini-unlisted-xyz' });
    expect(google.api).toBe('google-generative-ai');
    expect(google.provider).toBe('google');

    expect(resolveDomeModel({ provider: 'vllm', model: 'meta-llama/Llama-3' })).toMatchObject({
      provider: 'vllm',
      api: 'openai-completions',
      baseUrl: 'http://127.0.0.1:8000/v1',
      contextWindow: 32_768,
      compat: { supportsUsageInStreaming: false, supportsStore: false },
    });
    expect(
      resolveDomeModel({
        provider: 'vllm',
        model: 'm',
        baseUrl: 'http://gpu.local:8000',
      }).baseUrl,
    ).toBe('http://gpu.local:8000/v1');
    expect(
      resolveDomeModel({ provider: 'lmstudio', model: 'loaded-model' }),
    ).toMatchObject({
      provider: 'lmstudio',
      api: 'openai-completions',
      baseUrl: 'http://127.0.0.1:1234/v1',
      compat: { supportsUsageInStreaming: false, supportsStore: false },
    });
    expect(
      resolveDomeModel({
        provider: 'lmstudio',
        model: 'm',
        baseUrl: 'http://127.0.0.1:1234/v1',
      }).baseUrl,
    ).toBe('http://127.0.0.1:1234/v1');

    const unknown = resolveDomeModel({
      provider: 'some-unknown-provider',
      model: 'm1',
    });
    expect(unknown).toMatchObject({
      id: 'm1',
      provider: 'some-unknown-provider',
      api: 'openai-completions',
      baseUrl: 'https://openrouter.ai/api/v1',
    });
  });
});

describe('usage + text helpers', () => {
  it('converts usage both ways and extracts assistant text', () => {
    const usage: Usage = {
      input: 3,
      output: 5,
      cacheRead: 1,
      cacheWrite: 0,
      totalTokens: 8,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    expect(domeUsageToLegacy(usage)).toEqual({
      inputTokens: 3,
      outputTokens: 5,
      totalTokens: 8,
    });
    expect(domeUsageToLegacy(null)).toBeNull();
    expect(legacyUsageToDome(null)).toBeNull();
    expect(legacyUsageToDome({ inputTokens: 1, outputTokens: 2, totalTokens: 3 })).toMatchObject({
      input: 1,
      output: 2,
      totalTokens: 3,
      cacheRead: 0,
      cacheWrite: 0,
    });

    const msg: AssistantMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'toolCall', id: 't', name: 'x', arguments: {} },
        { type: 'text', text: ' world' },
      ],
      api: 'openai-completions',
      provider: 'openai',
      model: 'gpt',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: 1,
    };
    expect(extractTextFromAssistantMessage(msg)).toBe('hello world');
  });
});
