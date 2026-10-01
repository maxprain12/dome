import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getAIConfig, type AIConfig } from '@/lib/ai';

export type ComposerMultimodalCapabilities = {
  supportsImage: boolean;
  supportsVideo: boolean;
  modelId: string;
  loading: boolean;
};

type CapsSetter = Dispatch<SetStateAction<ComposerMultimodalCapabilities>>;

async function computeMultimodalCaps(cfg: AIConfig): Promise<Partial<ComposerMultimodalCapabilities>> {
  const modelId = cfg.provider === 'ollama' ? (cfg.ollamaModel ?? cfg.model ?? '') : (cfg.model ?? '');
  if (!modelId) return { modelId, supportsImage: false, supportsVideo: false };
  const result = await window.electron.invoke('ai:model:input', { provider: cfg.provider, model: modelId }) as { success: boolean; input?: string[]; error?: string };
  if (!result.success) throw new Error(result.error);
  return { modelId, supportsImage: result.input?.includes('image') === true, supportsVideo: false };
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
    supportsImage: false,
    supportsVideo: false,
    modelId: '',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const loadCaps = () => {
      void getAIConfig().then(async (cfg) => {
        applyCaps(setCaps, cancelled, cfg ? await computeMultimodalCaps(cfg) : {});
      }).catch(() => applyCaps(setCaps, cancelled, { supportsImage: false, supportsVideo: false }));
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
