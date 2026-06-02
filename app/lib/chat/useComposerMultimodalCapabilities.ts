import { useEffect, useState } from 'react';
import { getAIConfig } from '@/lib/ai';
import {
  findModelById,
  getModelsForProvider,
  modelSupportsVideo,
  modelSupportsVision,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';

export type ComposerMultimodalCapabilities = {
  supportsImage: boolean;
  supportsVideo: boolean;
  modelId: string;
  loading: boolean;
};

function resolveModel(provider: AIProviderType, modelId: string): ModelDefinition | undefined {
  const found = findModelById(modelId);
  if (found?.provider === provider) return found.model;
  return getModelsForProvider(provider).find((m) => m.id === modelId);
}

export function useComposerMultimodalCapabilities(): ComposerMultimodalCapabilities {
  const [caps, setCaps] = useState<ComposerMultimodalCapabilities>({
    supportsImage: true,
    supportsVideo: false,
    modelId: '',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    void getAIConfig().then((cfg) => {
      if (cancelled || !cfg) {
        setCaps((prev) => ({ ...prev, loading: false }));
        return;
      }
      const provider = cfg.provider as AIProviderType;
      const modelId =
        provider === 'ollama' ? (cfg.ollamaModel ?? cfg.model ?? '') : (cfg.model ?? '');
      const model = resolveModel(provider, modelId);
      if (model) {
        setCaps({
          supportsImage: modelSupportsVision(model),
          supportsVideo: modelSupportsVideo(model),
          modelId,
          loading: false,
        });
        return;
      }
      setCaps({
        supportsImage: provider !== 'minimax' || /^MiniMax-M3$/i.test(modelId),
        supportsVideo: /^MiniMax-M3$/i.test(modelId),
        modelId,
        loading: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return caps;
}

export function composerFileAccept(caps: ComposerMultimodalCapabilities): string {
  const parts = ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json', '.ppt', '.pptx'];
  if (caps.supportsImage) parts.unshift('image/*');
  if (caps.supportsVideo) parts.push('video/mp4', 'video/quicktime', '.mp4', '.mov', '.avi', '.mkv');
  return parts.join(',');
}
