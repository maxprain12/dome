import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GenerateProgress, GenerateProgressPhase } from '@/lib/learn/types';

const STEPS: { phase: GenerateProgressPhase; labelKey: string; fallback: string }[] = [
  { phase: 'reading', labelKey: 'learn.gen_reading', fallback: 'Reading sources' },
  { phase: 'extracting', labelKey: 'learn.gen_extracting', fallback: 'Extracting concepts' },
  { phase: 'writing', labelKey: 'learn.gen_writing', fallback: 'Writing draft' },
  { phase: 'explaining', labelKey: 'learn.gen_explaining', fallback: 'Adding explanations' },
  { phase: 'saving', labelKey: 'learn.gen_saving', fallback: 'Saving' },
];

function stepState(
  stepPhase: GenerateProgressPhase,
  current?: GenerateProgress | null,
): 'done' | 'running' | 'pending' {
  if (!current) return 'pending';
  if (current.phase === 'error') return stepPhase === 'reading' ? 'running' : 'pending';
  if (current.phase === 'done') return 'done';

  const order = STEPS.map((s) => s.phase);
  const curIdx = order.indexOf(current.phase);
  const stepIdx = order.indexOf(stepPhase);
  if (stepIdx < curIdx) return 'done';
  if (stepIdx === curIdx) return 'running';
  return 'pending';
}

interface GenerateProgressViewProps {
  progress: GenerateProgress | null;
  onRetry?: () => void;
}

export default function GenerateProgressView({ progress, onRetry }: GenerateProgressViewProps) {
  const { t } = useTranslation();
  const shimmer = progress?.message || t('learn.generating', 'Generating…');
  const isError = progress?.phase === 'error';

  return (
    <div className="lr-genprog">
      {isError ? (
        <div className="lr-genprog-hd">
          <div className="lr-genprog-icon">
            <Sparkles size={18} aria-hidden />
          </div>
          <div>
            <div className="lr-genprog-title">{t('learn.generation_failed', 'Generation failed')}</div>
            <div className="lr-genprog-shimmer">{shimmer}</div>
          </div>
        </div>
      ) : null}
      {isError ? (
        <div className="lr-genprog-error">
          <p>{progress?.error ?? progress?.message}</p>
          {onRetry ? (
            <button type="button" className="lr-btn lr-btn-primary" onClick={onRetry}>
              {t('learn.retry', 'Try again')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="lr-genprog-steps">
        {STEPS.map((step) => {
          const state = stepState(step.phase, progress);
          return (
            <div key={step.phase} className={`lr-genprog-step ${state}`}>
              <span className="lr-genprog-step-dot" />
              <span>{t(step.labelKey, step.fallback)}</span>
              {state === 'running' && progress?.draftItem ? (
                <span className="lr-genprog-step-meta">{progress.draftItem}</span>
              ) : null}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}
