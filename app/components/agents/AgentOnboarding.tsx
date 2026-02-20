'use client';

import { useState, useCallback } from 'react';
import type { ManyAgent } from '@/types';
import { createManyAgent } from '@/lib/agents/api';
import { showToast } from '@/lib/store/useToastStore';
import AgentNameStep, { type AgentNameData } from './steps/AgentNameStep';
import AgentInstructionsStep from './steps/AgentInstructionsStep';
import AgentToolsStep from './steps/AgentToolsStep';
import AgentMcpStep from './steps/AgentMcpStep';
import AgentSkillsStep from './steps/AgentSkillsStep';
import AgentIconStep from './steps/AgentIconStep';

type Step = 'name' | 'instructions' | 'tools' | 'mcp' | 'skills' | 'icon';

const STEP_ORDER: Step[] = ['name', 'instructions', 'tools', 'mcp', 'skills', 'icon'];

const STEP_LABELS: Record<Step, string> = {
  name: 'Nombre',
  instructions: 'Instrucciones',
  tools: 'Herramientas',
  mcp: 'MCP',
  skills: 'Skills',
  icon: 'Icono',
};

interface AgentOnboardingProps {
  onComplete: (agent: ManyAgent) => void;
  onCancel: () => void;
}

export default function AgentOnboarding({ onComplete, onCancel }: AgentOnboardingProps) {
  const [currentStep, setCurrentStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [iconIndex, setIconIndex] = useState(1);
  const [canProceed, setCanProceed] = useState(false);
  const [saving, setSaving] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(currentStep);

  const handleNext = useCallback(async () => {
    if (currentStep === 'icon') {
      setSaving(true);
      try {
        const result = await createManyAgent({
          name: name.trim(),
          description: description.trim(),
          systemInstructions: systemInstructions.trim(),
          toolIds,
          mcpServerIds,
          skillIds,
          iconIndex,
        });
        if (result.success && result.data) {
          showToast('success', 'Agente creado correctamente');
          onComplete(result.data);
        } else {
          showToast('error', result.error || 'Error al crear agente');
        }
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Error al crear agente');
      } finally {
        setSaving(false);
      }
      return;
    }
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIdx]);
    }
  }, [currentStep, stepIndex, name, description, systemInstructions, toolIds, mcpServerIds, skillIds, iconIndex, onComplete]);

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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--primary-text)' }}>
          Nuevo agente
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
            Cancelar
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1 px-4 py-2 overflow-x-auto shrink-0" style={{ backgroundColor: 'var(--bg-secondary)' }}>
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

      {/* Content */}
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

      {/* Footer */}
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
          {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
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
          {saving ? 'Guardando...' : isLastStep ? 'Crear agente' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
