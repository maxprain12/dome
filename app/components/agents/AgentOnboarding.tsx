'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Check, X } from 'lucide-react';
import type { ManyAgent } from '@/types';
import { createManyAgent, updateManyAgent } from '@/lib/agents/api';
import { showToast } from '@/lib/store/useToastStore';
import AgentNameStep, { type AgentNameData } from './steps/AgentNameStep';
import AgentInstructionsStep from './steps/AgentInstructionsStep';
import AgentMcpStep from './steps/AgentMcpStep';
import AgentIconStep from './steps/AgentIconStep';
import DomeButton from '@/components/ui/DomeButton';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';

type Step = 'name' | 'instructions' | 'mcp' | 'icon';

const STEP_ORDER: Step[] = ['name', 'instructions', 'mcp', 'icon'];

interface AgentOnboardingProps {
  onComplete: (agent: ManyAgent) => void;
  onCancel: () => void;
  initialAgent?: ManyAgent | null;
  projectId?: string;
}

function StepProgress({ currentStep }: { currentStep: Step }) {
  const { t } = useTranslation();
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const STEP_LABELS: Record<Step, string> = {
    name: t('onboarding.step_name'),
    instructions: t('onboarding.step_instructions'),
    mcp: t('onboarding.step_mcp'),
    icon: t('onboarding.step_icon'),
  };

  return (
    <div className="flex items-center gap-1 px-6 py-3 shrink-0">
      {STEP_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className="flex items-center justify-center size-6 rounded-full text-xs font-medium transition-all"
            style={{
              background:
                s === currentStep
                  ? 'var(--dome-accent)'
                  : i < currentStepIndex
                    ? accentMixStep(18)
                    : 'var(--dome-border)',
              color:
                s === currentStep
                  ? 'var(--base-text)'
                  : i < currentStepIndex
                    ? 'var(--dome-accent)'
                    : 'var(--dome-text-muted)',
            }}
          >
            {i < currentStepIndex ? <Check size={12} /> : i + 1}
          </div>
          <span
            className="text-xs hidden sm:inline"
            style={{ color: s === currentStep ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}
          >
            {STEP_LABELS[s]}
          </span>
          {i < STEP_ORDER.length - 1 && (
            <div
              className="w-4 h-0.5 mx-1"
              style={{
                background: i < currentStepIndex ? 'var(--dome-accent)' : 'var(--dome-border)',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function accentMixStep(pct: number): string {
  return `color-mix(in srgb, var(--dome-accent) ${pct}%, var(--dome-surface))`;
}

export default function AgentOnboarding({ onComplete, onCancel, initialAgent, projectId = 'default' }: AgentOnboardingProps) {
  const { t } = useTranslation();
  const isEditMode = !!initialAgent;
  const [currentStep, setCurrentStep] = useState<Step>('name');
  const [name, setName] = useState(initialAgent?.name ?? '');
  const [description, setDescription] = useState(initialAgent?.description ?? '');
  const [systemInstructions, setSystemInstructions] = useState(initialAgent?.systemInstructions ?? '');
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(initialAgent?.mcpServerIds ?? []);
  const [iconIndex, setIconIndex] = useState(initialAgent?.iconIndex ?? 1);
  const [canProceed, setCanProceed] = useState((initialAgent?.name ?? '').trim().length > 0);
  const [saving, setSaving] = useState(false);

  const prevInitialAgentRef = useRef(initialAgent);
  if (initialAgent !== prevInitialAgentRef.current) {
    prevInitialAgentRef.current = initialAgent;
    if (initialAgent) {
      setName(initialAgent.name);
      setDescription(initialAgent.description);
      setSystemInstructions(initialAgent.systemInstructions);
      setMcpServerIds(initialAgent.mcpServerIds ?? []);
      setIconIndex(initialAgent.iconIndex ?? 1);
      setCanProceed(initialAgent.name.trim().length > 0);
    }
  }

  const stepIndex = STEP_ORDER.indexOf(currentStep);

  const handleNext = useCallback(async () => {
    if (currentStep === 'icon') {
      setSaving(true);
      try {
        if (isEditMode && initialAgent) {
          const result = await updateManyAgent(initialAgent.id, {
            name: name.trim(),
            description: description.trim(),
            systemInstructions: systemInstructions.trim(),
            mcpServerIds,
            iconIndex,
          });
          if (result.success && result.data) {
            showToast('success', t('agents.edit_agent'));
            onComplete(result.data);
          } else {
            showToast('error', result.error || t('common.error'));
          }
        } else {
          const result = await createManyAgent({
            name: name.trim(),
            description: description.trim(),
            systemInstructions: systemInstructions.trim(),
            toolIds: [],
            mcpServerIds,
            iconIndex,
            projectId,
          });
          if (result.success && result.data) {
            showToast('success', t('agents.new_agent'));
            onComplete(result.data);
          } else {
            showToast('error', result.error || t('common.error'));
          }
        }
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : t('common.error'));
      } finally {
        setSaving(false);
      }
      return;
    }
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIdx]);
    }
  }, [currentStep, stepIndex, name, description, systemInstructions, mcpServerIds, iconIndex, onComplete, isEditMode, initialAgent, projectId, t]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) {
      setCurrentStep(STEP_ORDER[stepIndex - 1]);
    } else {
      onCancel();
    }
  }, [stepIndex, onCancel]);

  const handleNameChange = useCallback((data: AgentNameData) => {
    setName(data.name);
    setDescription(data.description);
  }, []);

  const isLastStep = currentStep === 'icon';

  const handleSave = useCallback(async () => {
    if (!isEditMode || !initialAgent) return;
    setSaving(true);
    try {
      const result = await updateManyAgent(initialAgent.id, {
        name: name.trim(),
        description: description.trim(),
        systemInstructions: systemInstructions.trim(),
        mcpServerIds,
        iconIndex,
      });
      if (result.success && result.data) {
        showToast('success', t('agents.edit_agent'));
        onComplete(result.data);
      } else {
        showToast('error', result.error || t('common.error'));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }, [isEditMode, initialAgent, name, description, systemInstructions, mcpServerIds, iconIndex, onComplete, t]);

  const editSections = (
    <>
      <section>
        <DomeSectionLabel className="mb-3">{t('onboarding.step_name')}</DomeSectionLabel>
        <AgentNameStep
          initialName={name}
          initialDescription={description}
          onChange={handleNameChange}
          onValidationChange={setCanProceed}
        />
      </section>
      <section>
        <DomeSectionLabel className="mb-3">{t('onboarding.step_instructions')}</DomeSectionLabel>
        <AgentInstructionsStep initialInstructions={systemInstructions} onChange={setSystemInstructions} />
      </section>
      <section>
        <DomeSectionLabel className="mb-3">{t('onboarding.step_mcp')}</DomeSectionLabel>
        <AgentMcpStep selectedIds={mcpServerIds} onChange={setMcpServerIds} />
      </section>
      <section>
        <DomeSectionLabel className="mb-3">{t('onboarding.step_icon')}</DomeSectionLabel>
        <AgentIconStep selectedIndex={iconIndex} onChange={setIconIndex} />
      </section>
    </>
  );

  if (isEditMode) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <header className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--dome-border)] bg-[var(--dome-bg)]">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="size-4 text-[var(--dome-accent)] shrink-0" aria-hidden />
            <h1 className="text-base font-semibold text-[var(--dome-text)] truncate">{t('agents.edit_agent')}</h1>
          </div>
          <DomeButton type="button" variant="ghost" size="sm" iconOnly onClick={onCancel} aria-label={t('common.close')}>
            <X className="size-4" />
          </DomeButton>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-8">{editSections}</div>

        <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--dome-border)] shrink-0">
          <DomeButton type="button" variant="outline" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </DomeButton>
          <DomeButton type="button" variant="primary" size="sm" onClick={() => void handleSave()} disabled={!canProceed || saving} loading={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </DomeButton>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--dome-border)] bg-[var(--dome-bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="size-4 text-[var(--dome-accent)] shrink-0" aria-hidden />
          <h1 className="text-base font-semibold text-[var(--dome-text)] truncate">{t('agents.new_agent')}</h1>
        </div>
        <DomeButton type="button" variant="ghost" size="sm" iconOnly onClick={onCancel} aria-label={t('common.close')}>
          <X className="size-4" />
        </DomeButton>
      </header>

      <StepProgress currentStep={currentStep} />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {currentStep === 'name' && (
          <AgentNameStep
            initialName={name}
            initialDescription={description}
            onChange={handleNameChange}
            onValidationChange={setCanProceed}
          />
        )}
        {currentStep === 'instructions' && (
          <AgentInstructionsStep initialInstructions={systemInstructions} onChange={setSystemInstructions} />
        )}
        {currentStep === 'mcp' && <AgentMcpStep selectedIds={mcpServerIds} onChange={setMcpServerIds} />}
        {currentStep === 'icon' && <AgentIconStep selectedIndex={iconIndex} onChange={setIconIndex} />}
      </div>

      <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--dome-border)] shrink-0">
        <DomeButton type="button" variant="outline" size="sm" onClick={handleBack}>
          {stepIndex === 0 ? t('common.cancel') : t('common.back')}
        </DomeButton>
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void handleNext()}
          disabled={(currentStep === 'name' && !canProceed) || saving}
          loading={saving}
        >
          {saving ? t('common.saving') : isLastStep ? t('agents.new_agent') : t('onboarding.continue')}
        </DomeButton>
      </footer>
    </div>
  );
}
