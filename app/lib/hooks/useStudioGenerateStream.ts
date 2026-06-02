import { useCallback, useEffect, useRef } from 'react';
import type { GenerateConfig, GenerateProgress, GenerateProgressPhase } from '@/lib/learn/types';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useStudioGenerate } from '@/lib/hooks/useStudioGenerate';
import { StudioGenerateError } from '@/lib/learn/studioGenerateErrors';
import type { StudioOutputType } from '@/types';

const PHASE_ORDER: GenerateProgressPhase[] = ['reading', 'extracting', 'writing', 'explaining', 'saving'];
const PROGRESS_TIMEOUT_MS = 90_000;
const DONE_VISIBLE_MS = 900;

const MAIN_PHASE_MAP: Record<string, GenerateProgressPhase> = {
  read: 'reading',
  extract: 'extracting',
  ready: 'writing',
  error: 'error',
  reading: 'reading',
  extracting: 'extracting',
  writing: 'writing',
  explaining: 'explaining',
  saving: 'saving',
  done: 'done',
};

function phaseIndex(phase: GenerateProgressPhase): number {
  if (phase === 'done') return PHASE_ORDER.length;
  if (phase === 'error') return -1;
  const idx = PHASE_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

function phaseFromPayload(data: {
  phase?: string;
  message?: string;
  runId?: string;
  current?: number;
  total?: number;
  draftItem?: string;
  error?: string;
}): GenerateProgress {
  const raw = data.phase ?? 'writing';
  const phase = MAIN_PHASE_MAP[raw] ?? 'writing';

  return {
    runId: data.runId ?? '',
    phase,
    message: data.message ?? '',
    current: data.current,
    total: data.total,
    draftItem: data.draftItem,
    error: data.error,
  };
}

function mergeProgress(current: GenerateProgress | null, next: GenerateProgress): GenerateProgress {
  if (!current) return next;
  if (next.phase === 'error') return next;
  if (current.phase === 'error') return current;
  if (phaseIndex(next.phase) >= phaseIndex(current.phase)) {
    return { ...current, ...next, phase: next.phase };
  }
  return current;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useStudioGenerateStream(options?: { projectId?: string | null }) {
  const setProgress = useLearnStore((s) => s.setProgress);
  const setActiveRunId = useLearnStore((s) => s.setActiveRunId);
  const setWizardShowProgress = useLearnStore((s) => s.setWizardShowProgress);
  const loadDecks = useLearnStore((s) => s.loadDecks);
  const loadStudioOutputs = useLearnStore((s) => s.loadStudioOutputs);

  const storeProjectId = useAppStore((s) => s.currentProject?.id ?? null);
  const projectId = options?.projectId ?? storeProjectId;
  const localRunId = useRef<string | null>(null);
  const lastProgressAt = useRef<number>(0);
  const isGeneratingRef = useRef(false);

  const reportProgress = useCallback(
    (phase: GenerateProgressPhase, message: string) => {
      if (!localRunId.current) return;
      lastProgressAt.current = Date.now();
      const current = useLearnStore.getState().progress;
      setProgress(
        mergeProgress(current, {
          runId: localRunId.current,
          phase,
          message,
        }),
      );
    },
    [setProgress],
  );

  const { generate, isGenerating, generatingType } = useStudioGenerate({
    projectId,
    onProgress: reportProgress,
  });

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.db?.studio?.onProgress) return;

    const off = window.electron.db.studio.onProgress((data) => {
      if (!data || !isGeneratingRef.current) return;
      lastProgressAt.current = Date.now();
      const incoming = phaseFromPayload(data);
      const current = useLearnStore.getState().progress;
      setProgress(mergeProgress(current, incoming));
      if (data.runId) setActiveRunId(data.runId);
    });

    return off;
  }, [setProgress, setActiveRunId]);

  const generateWithProgress = useCallback(
    async (
      type: StudioOutputType,
      sourceIds: string[],
      resourceId: string | null,
      config?: GenerateConfig,
    ): Promise<boolean> => {
      const runId = crypto.randomUUID();
      localRunId.current = runId;
      lastProgressAt.current = Date.now();
      setActiveRunId(runId);
      setWizardShowProgress(true);
      setProgress({ runId, phase: 'reading', message: 'Reading sources…' });

      const timeoutId = window.setTimeout(() => {
        if (localRunId.current !== runId) return;
        if (Date.now() - lastProgressAt.current >= PROGRESS_TIMEOUT_MS) {
          setProgress({
            runId,
            phase: 'error',
            message: 'Generation timed out',
            error: 'TIMEOUT',
          });
        }
      }, PROGRESS_TIMEOUT_MS + 500);

      try {
        const ok = await generate(type, sourceIds, resourceId, config);
        window.clearTimeout(timeoutId);

        if (ok) {
          reportProgress('saving', 'Saving…');
          await sleep(200);
          setProgress({ runId, phase: 'done', message: 'Done' });
          await sleep(DONE_VISIBLE_MS);
          await Promise.all([loadDecks(), loadStudioOutputs(projectId ?? undefined)]);
        } else {
          const current = useLearnStore.getState().progress;
          if (current?.phase !== 'error') {
            setProgress({
              runId,
              phase: 'error',
              message: 'Generation failed',
              error: 'GENERATION_FAILED',
            });
          }
        }
        return ok;
      } catch (err) {
        window.clearTimeout(timeoutId);
        const code =
          err instanceof StudioGenerateError ? err.code : 'GENERATION_FAILED';
        const message = err instanceof Error ? err.message : 'Generation failed';
        setProgress({ runId, phase: 'error', message, error: code });
        return false;
      } finally {
        localRunId.current = null;
      }
    },
    [
      generate,
      loadDecks,
      loadStudioOutputs,
      projectId,
      reportProgress,
      setActiveRunId,
      setProgress,
      setWizardShowProgress,
    ],
  );

  return { generate: generateWithProgress, isGenerating, generatingType };
}
