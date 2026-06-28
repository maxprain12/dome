import type { AIProviderType } from '@/lib/ai/models';

export function isCloudAIProvider(provider: AIProviderType): boolean {
  return (
    provider === 'openai' ||
    provider === 'anthropic' ||
    provider === 'google' ||
    provider === 'minimax' ||
    provider === 'openrouter' ||
    provider === 'deepseek' ||
    provider === 'moonshot' ||
    provider === 'qwen' ||
    provider === 'opencode' ||
    provider === 'opencode-go'
  );
}
