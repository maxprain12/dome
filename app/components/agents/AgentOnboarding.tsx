'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManyAgent } from '@/types';
import { createManyAgent, updateManyAgent } from '@/lib/agents/api';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import { showToast } from '@/lib/store/useToastStore';
import AgentNameStep, { type AgentNameData } from './steps/AgentNameStep';
import AgentInstructionsStep from './steps/AgentInstructionsStep';
import AgentToolsStep from './steps/AgentToolsStep';
import AgentMcpStep from './steps/AgentMcpStep';
import AgentSkillsStep from './steps/AgentSkillsStep';
import AgentIconStep from './steps/AgentIconStep';

type Step = 'name' | 'instructions' | 'tools' | 'mcp' | 'skills' | 'icon';

const STEP_ORDER: Step[] = ['name', 'instructions', 'tools', 'mcp', 'skills', 'icon'];

interface AgentOnboardingProps {
  onComplete: (agent: ManyAgent) => void;
  onCancel: () => void;
  /** When provided, runs in edit mode (prefilled, saves via updateManyAgent) */
  initialAgent?: ManyAgent | null;
  /** Project scope for new agents (default: default) */
  projectId?: string;
}

export default function AgentOnboarding({ onComplete, onCancel, initialAgent, projectId = 'default' }: AgentOnboardingProps) {
  const { t } = useTranslation();
  const stepsRef = useRef<HTMLDivElement>(null);
  const isEditMode = !!initialAgent;
  const [currentStep, setCurrentStep] = useState<Step>('name');
  const [name, setName] = useState(initialAgent?.name ?? '');
  const [description, setDescription] = useState(initialAgent?.description ?? '');
  const [systemInstructions, setSystemInstructions] = useState(initialAgent?.systemInstructions ?? '');
  const [toolIds, setToolIds] = useState<string[]>(initialAgent?.toolIds ?? []);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(initialAgent?.mcpServerIds ?? []);
  const [skillIds, setSkillIds] = useState<string[]>(initialAgent?.skillIds ?? []);
  const [iconIndex, setIconIndex] = useState(initialAgent?.iconIndex ?? 1);
  const [canProceed, setCanProceed] = useState((initialAgent?.name ?? '').trim().length > 0);
  const [saving, setSaving] = useState(false);

  useHorizontalScroll(stepsRef);

  // Sync when initialAgent changes (e.g. switching to edit another agent)
  useEffect(() => {
    if (initialAgent) {
      setName(initialAgent.name);
      setDescription(initialAgent.description);
      setSystemInstructions(initialAgent.systemInstructions);
      setToolIds(initialAgent.toolIds ?? []);
      setMcpServerIds(initialAgent.mcpServerIds ?? []);
      setSkillIds(initialAgent.skillIds ?? []);
      setIconIndex(initialAgent.iconIndex ?? 1);
      setCanProceed(initialAgent.name.trim().length > 0);
    }
  }, [initialAgent]);

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
            toolIds,
            mcpServerIds,
            skillIds,
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
            toolIds,
            mcpServerIds,
            skillIds,
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
  }, [currentStep, stepIndex, name, description, systemInstructions, toolIds, mcpServerIds, skillIds, iconIndex, onComplete, isEditMode, initialAgent, projectId, t]);

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
        toolIds,
        mcpServerIds,
        skillIds,
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
  }, [isEditMode, initialAgent, name, description, systemInstructions, toolIds, mcpServerIds, skillIds, iconIndex, onComplete, t]);

  // Formulario único para edición (sin etapas)
  if (isEditMode) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--primary-text)' }}>
            {t('agents.edit_agent')}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-2 py-1 rounded hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--secondary-text)' }}
          >
            {t('common.cancel')}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-8">
          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              {t('onboarding.step_name')}
            </h3>
            <AgentNameStep
              initialName={name}
              initialDescription={description}
              onChange={handleNameChange}
              onValidationChange={setCanProceed}
            />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              {t('onboarding.step_instructions')}
            </h3>
            <AgentInstructionsStep
              initialInstructions={systemInstructions}
              onChange={setSystemInstructions}
            />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              {t('onboarding.step_tools')}
            </h3>
            <AgentToolsStep selectedIds={toolIds} onChange={setToolIds} />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              {t('onboarding.step_mcp')}
            </h3>
            <AgentMcpStep selectedIds={mcpServerIds} onChange={setMcpServerIds} />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              {t('onboarding.step_skills')}
            </h3>
            <AgentSkillsStep selectedIds={skillIds} onChange={setSkillIds} />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              {t('onboarding.step_icon')}
            </h3>
            <AgentIconStep selectedIndex={iconIndex} onChange={setIconIndex} />
          </section>
        </div>

        <div
          className="flex items-center justify-end gap-3 px-4 py-3 border-t shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--primary-text)',
              border: '1px solid var(--border)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canProceed || saving}
            className="px-6 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: !canProceed || saving ? 'var(--bg-tertiary)' : 'var(--accent)',
            }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    );
  }

  const STEP_LABELS: Record<Step, string> = {
    name: t('onboarding.step_name'),
    instructions: t('onboarding.step_instructions'),
    tools: t('onboarding.step_tools'),
    mcp: t('onboarding.step_mcp'),
    skills: t('onboarding.step_skills'),
    icon: t('onboarding.step_icon'),
  };

  // Wizard por etapas para creación
  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--primary-text)' }}>
          {t('agents.new_agent')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>
            {stepIndex + 1} / {STEP_ORDER.length}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-2 py-1 rounded"
            style={{ color: 'var(--secondary-text)' }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>

      <div
        ref={stepsRef}
        className="flex gap-1 px-4 py-2 overflow-x-auto shrink-0 scrollbar-none"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        {STEP_ORDER.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => i <= stepIndex && setCurrentStep(s)}
            className={`px-2 py-1 rounded text-xs whitespace-nowrap ${currentStep === s ? 'font-medium' : ''
              }`}
            style={{
              color: currentStep === s ? 'var(--accent)' : 'var(--secondary-text)',
              backgroundColor: currentStep === s ? 'var(--accent-bg)' : 'transparent',
            }}
          >
            {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {currentStep === 'name' && (
          <AgentNameStep
            initialName={name}
            initialDescription={description}
            onChange={handleNameChange}
            onValidationChange={setCanProceed}
          />
        )}
        {currentStep === 'instructions' && (
          <AgentInstructionsStep
            initialInstructions={systemInstructions}
            onChange={setSystemInstructions}
          />
        )}
        {currentStep === 'tools' && (
          <AgentToolsStep selectedIds={toolIds} onChange={setToolIds} />
        )}
        {currentStep === 'mcp' && (
          <AgentMcpStep selectedIds={mcpServerIds} onChange={setMcpServerIds} />
        )}
        {currentStep === 'skills' && (
          <AgentSkillsStep selectedIds={skillIds} onChange={setSkillIds} />
        )}
        {currentStep === 'icon' && (
          <AgentIconStep selectedIndex={iconIndex} onChange={setIconIndex} />
        )}
      </div>

      <div
        className="flex items-center justify-between px-4 py-3 border-t shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="px-4 py-2 text-sm font-medium rounded-lg"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--primary-text)',
            border: '1px solid var(--border)',
          }}
        >
          {stepIndex === 0 ? t('common.cancel') : t('common.back')}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={(currentStep === 'name' && !canProceed) || saving}
          className="px-6 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: (currentStep === 'name' && !canProceed) || saving ? 'var(--bg-tertiary)' : 'var(--accent)',
          }}
        >
          {saving ? t('common.saving') : isLastStep ? t('agents.new_agent') : t('onboarding.continue')}
        </button>
      </div>
    </div>
  );
}
