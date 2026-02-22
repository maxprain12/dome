'use client';

import { useState, useCallback, useEffect } from 'react';
import type { ManyAgent } from '@/types';
import { createManyAgent, updateManyAgent } from '@/lib/agents/api';
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
  /** When provided, runs in edit mode (prefilled, saves via updateManyAgent) */
  initialAgent?: ManyAgent | null;
}

export default function AgentOnboarding({ onComplete, onCancel, initialAgent }: AgentOnboardingProps) {
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
            showToast('success', 'Agente actualizado correctamente');
            onComplete(result.data);
          } else {
            showToast('error', result.error || 'Error al actualizar agente');
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
          });
          if (result.success && result.data) {
            showToast('success', 'Agente creado correctamente');
            onComplete(result.data);
          } else {
            showToast('error', result.error || 'Error al crear agente');
          }
        }
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Error al guardar agente');
      } finally {
        setSaving(false);
      }
      return;
    }
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIdx]);
    }
  }, [currentStep, stepIndex, name, description, systemInstructions, toolIds, mcpServerIds, skillIds, iconIndex, onComplete, isEditMode, initialAgent]);

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
        showToast('success', 'Agente actualizado correctamente');
        onComplete(result.data);
      } else {
        showToast('error', result.error || 'Error al actualizar agente');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Error al guardar agente');
    } finally {
      setSaving(false);
    }
  }, [isEditMode, initialAgent, name, description, systemInstructions, toolIds, mcpServerIds, skillIds, iconIndex, onComplete]);

  // Formulario único para edición (sin etapas)
  if (isEditMode) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--primary-text)' }}>
            Editar agente
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-2 py-1 rounded hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--secondary-text)' }}
          >
            Cancelar
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-8">
          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              Información básica
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
              Instrucciones del sistema
            </h3>
            <AgentInstructionsStep
              initialInstructions={systemInstructions}
              onChange={setSystemInstructions}
            />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              Herramientas
            </h3>
            <AgentToolsStep selectedIds={toolIds} onChange={setToolIds} />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              MCP
            </h3>
            <AgentMcpStep selectedIds={mcpServerIds} onChange={setMcpServerIds} />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              Skills
            </h3>
            <AgentSkillsStep selectedIds={skillIds} onChange={setSkillIds} />
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
              Icono
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
            Cancelar
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
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    );
  }

  // Wizard por etapas para creación
  return (
    <div className="flex flex-col h-full min-h-0">
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
