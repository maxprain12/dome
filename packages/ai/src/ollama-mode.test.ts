import { describe, expect, it } from 'vitest';
import { ollamaRequiresApiKey, resolveOllamaMode } from './ollama-mode.js';

describe('resolveOllamaMode', () => {
  it('treats localhost as local', () => {
    expect(resolveOllamaMode('http://localhost:11434')).toBe('local');
    expect(resolveOllamaMode('http://127.0.0.1:11434')).toBe('local');
    expect(resolveOllamaMode('http://[::1]:11434')).toBe('local');
  });

  it('treats remote hosts as cloud', () => {
    expect(resolveOllamaMode('https://api.ollama.com')).toBe('cloud');
    expect(resolveOllamaMode('https://ollama.example.com')).toBe('cloud');
  });

  it('defaults empty or invalid URL to local', () => {
    expect(resolveOllamaMode()).toBe('local');
    expect(resolveOllamaMode('')).toBe('local');
    expect(resolveOllamaMode('not-a-url')).toBe('local');
  });
});

describe('ollamaRequiresApiKey', () => {
  it('requires key only in cloud mode', () => {
    expect(ollamaRequiresApiKey('http://localhost:11434')).toBe(false);
    expect(ollamaRequiresApiKey('https://api.ollama.com')).toBe(true);
  });
});
