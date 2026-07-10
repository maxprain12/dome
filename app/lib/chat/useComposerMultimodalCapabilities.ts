import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getAIConfig, type AIConfig } from '@/lib/ai';
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

type CapsSetter = Dispatch<SetStateAction<ComposerMultimodalCapabilities>>;

function resolveModel(provider: AIProviderType, modelId: string): ModelDefinition | undefined {
  const found = findModelById(modelId);
  if (found?.provider === provider) return found.model;
  return getModelsForProvider(provider).find((m) => m.id === modelId);
}

function computeMultimodalCaps(cfg: AIConfig): Partial<ComposerMultimodalCapabilities> {
  const provider = cfg.provider as AIProviderType;
  const modelId =
    provider === 'ollama' ? (cfg.ollamaModel ?? cfg.model ?? '') : (cfg.model ?? '');
  const model = resolveModel(provider, modelId);
  if (model) {
    return {
      supportsImage: modelSupportsVision(model),
      supportsVideo: modelSupportsVideo(model),
      modelId,
    };
  }
  // Unknown model: be permissive (don't block paste) except for the one
  // provider whose non-vision variants are common (minimax text models).
  return {
    supportsImage: provider !== 'minimax' || /^MiniMax-M3$/i.test(modelId),
    supportsVideo: /^MiniMax-M3$/i.test(modelId),
    modelId,
  };
}

function applyCaps(
  setCaps: CapsSetter,
  cancelled: boolean,
  next: Partial<ComposerMultimodalCapabilities>,
): void {
  if (cancelled) return;
  setCaps((prev) => ({ ...prev, ...next, loading: false }));
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

    const loadCaps = () => {
      void getAIConfig().then((cfg) => {
        applyCaps(setCaps, cancelled, cfg ? computeMultimodalCaps(cfg) : {});
      });
    };

    loadCaps();

    // Re-evaluate when the active model changes (InlineModelSwitcher dispatches
    // this). Without it the caps stayed frozen at the model present on mount, so
    // switching from a text-only model (e.g. MiniMax M2.7) to a vision model
    // (MiniMax M3) kept image paste blocked — GH issue 453.
    const onConfigChanged = () => loadCaps();
    window.addEventListener('dome:ai-config-changed', onConfigChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('dome:ai-config-changed', onConfigChanged);
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
