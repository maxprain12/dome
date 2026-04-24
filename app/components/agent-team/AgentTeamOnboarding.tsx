'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronLeft, X, Users, Cpu, Check } from 'lucide-react';
import type { ManyAgent, AgentTeam } from '@/types';
import { getManyAgents } from '@/lib/agents/api';
import { createAgentTeam } from '@/lib/agent-team/api';
import AgentToolsStep from '@/components/agents/steps/AgentToolsStep';
import AgentMcpStep from '@/components/agents/steps/AgentMcpStep';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeSubpageFooter from '@/components/ui/DomeSubpageFooter';
import DomeCard from '@/components/ui/DomeCard';
import { cn } from '@/lib/utils';

type Step = 'basics' | 'members' | 'capabilities' | 'supervisor' | 'icon';

const STEP_ORDER: Step[] = ['basics', 'members', 'capabilities', 'supervisor', 'icon'];

const STEP_LABELS: Record<Step, string> = {
  basics: 'Nombre',
  members: 'Agentes',
  capabilities: 'Capacidades',
  supervisor: 'Supervisor',
  icon: 'Icono',
};

interface AgentTeamOnboardingProps {
  onComplete: (team: AgentTeam) => void;
  onCancel: () => void;
}

const ICON_COUNT = 18;
const MAX_MEMBERS = 5;

const DEFAULT_SUPERVISOR_INSTRUCTIONS = `Eres el supervisor de este equipo de agentes. Cuando el usuario te dé una tarea:
1. Analiza la solicitud y decide qué agentes del equipo son más adecuados.
2. Desglosa la tarea en subtareas específicas para cada agente.
3. Delega cada subtarea al agente correspondiente usando la herramienta delegate_to_agent.
4. Una vez que todos los agentes hayan respondido, sintetiza los resultados en una respuesta coherente y bien estructurada.
5. Asegúrate de que las respuestas de los agentes se complementen y no se repitan innecesariamente.
Responde siempre en el idioma del usuario.`;

export default function AgentTeamOnboarding({ onComplete, onCancel }: AgentTeamOnboardingProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('basics');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [supervisorInstructions, setSupervisorInstructions] = useState(DEFAULT_SUPERVISOR_INSTRUCTIONS);
  const [iconIndex, setIconIndex] = useState(1);
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getManyAgents().then(setAgents);
  }, []);

  const currentStepIndex = STEP_ORDER.indexOf(step);

  const canProceed = () => {
    if (step === 'basics') return name.trim().length > 0;
    if (step === 'members') return selectedAgentIds.length >= 2;
    if (step === 'capabilities') return true;
    if (step === 'supervisor') return supervisorInstructions.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (currentStepIndex < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[currentStepIndex + 1]);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setStep(STEP_ORDER[currentStepIndex - 1]);
    }
  };

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const result = await createAgentTeam({
        name: name.trim(),
        description: description.trim(),
        supervisorInstructions: supervisorInstructions.trim(),
        memberAgentIds: selectedAgentIds,
        toolIds,
        mcpServerIds,
        iconIndex,
      });
      if (result.success && result.data) {
        onComplete(result.data);
      } else {
        setError(result.error ?? 'Error al crear el equipo');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id)
        ? prev.filter((a) => a !== id)
        : prev.length < MAX_MEMBERS
        ? [...prev, id]
        : prev
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header
        className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--dome-border,var(--border))] bg-[var(--bg)]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden />
          <h1 className="text-base font-semibold text-[var(--primary-text)] truncate">{t('agentTeam.new_team_title')}</h1>
        </div>
        <DomeButton type="button" variant="ghost" size="sm" iconOnly onClick={onCancel} aria-label={t('common.close')}>
          <X className="w-4 h-4" />
        </DomeButton>
      </header>

      {/* Step progress */}
      <div className="flex items-center gap-1 px-6 py-3 shrink-0">
        {STEP_ORDER.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-all"
                style={{
                background:
                  s === step
                    ? 'var(--accent)'
                    : i < currentStepIndex
                      ? 'color-mix(in srgb, var(--accent) 18%, var(--bg-secondary))'
                      : 'var(--border)',
                color:
                  s === step
                    ? 'var(--base-text)'
                    : i < currentStepIndex
                      ? 'var(--accent)'
                      : 'var(--dome-text-muted,var(--tertiary-text))',
              }}
            >
              {i < currentStepIndex ? <Check size={12} /> : i + 1}
            </div>
            <span
              className="text-xs hidden sm:inline"
              style={{ color: s === step ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}
            >
              {STEP_LABELS[s]}
            </span>
            {i < STEP_ORDER.length - 1 && (
              <div
                className="w-4 h-0.5 mx-1"
                style={{
                  background: i < currentStepIndex ? 'var(--accent)' : 'var(--border)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {step === 'basics' && (
          <div className="flex flex-col gap-4">
            <DomeInput
              label="Nombre del equipo *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Equipo de Investigación"
              autoFocus
              className="[&_label]:text-[var(--dome-text-muted)]"
              inputClassName="bg-[var(--dome-bg)] text-[var(--dome-text)] border-[var(--dome-border)] rounded-xl"
            />
            <DomeTextarea
              label="Descripción (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Qué hace este equipo?"
              rows={3}
              className="[&_label]:text-[var(--dome-text-muted)]"
              textareaClassName="bg-[var(--dome-bg)] text-[var(--dome-text)] border-[var(--dome-border)] rounded-xl resize-none"
            />
          </div>
        )}

        {step === 'members' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              Selecciona entre 2 y {MAX_MEMBERS} agentes para el equipo. ({selectedAgentIds.length}/{MAX_MEMBERS})
            </p>
            {agents.length === 0 ? (
              <div
                className="text-center py-10 text-sm"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                No tienes agentes creados. Crea agentes en la sección de Agentes primero.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {agents.map((agent) => {
                  const selected = selectedAgentIds.includes(agent.id);
                  const disabled = !selected && selectedAgentIds.length >= MAX_MEMBERS;
                  return (
                    <DomeCard
                      key={agent.id}
                      padding="sm"
                      className={cn(
                        'flex items-center gap-3 transition-all cursor-pointer border-[var(--dome-border,var(--border))]',
                        selected && 'ring-2 ring-[var(--accent)]',
                        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
                      )}
                      style={
                        selected
                          ? { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, var(--bg-secondary))' }
                          : undefined
                      }
                      onClick={() => !disabled && toggleAgent(agent.id)}
                      onKeyDown={(e) => {
                        if (disabled) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleAgent(agent.id);
                        }
                      }}
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                    >
                      <img
                        src={`/agents/sprite_${agent.iconIndex}.png`}
                        alt=""
                        className="w-9 h-9 shrink-0 rounded-lg object-contain"
                        style={{ background: 'var(--dome-surface)' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                          {agent.name}
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--dome-text-muted)' }}>
                          {agent.description || 'Sin descripción'}
                        </div>
                      </div>
                      <div
                        className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                        style={{
                          background: selected ? 'var(--accent)' : 'var(--border)',
                          color: 'var(--base-text)',
                        }}
                      >
                        {selected && <Check size={12} />}
                      </div>
                    </DomeCard>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 'supervisor' && (
          <div className="flex flex-col gap-4">
            <DomeCallout tone="info" className="!text-xs" title="Rol del supervisor">
              El supervisor recibe la tarea del usuario y coordina los agentes del equipo. Define cómo quieres que organice
              y distribuya el trabajo.
            </DomeCallout>
            <DomeTextarea
              label="Instrucciones del supervisor *"
              value={supervisorInstructions}
              onChange={(e) => setSupervisorInstructions(e.target.value)}
              rows={10}
              className="[&_label]:text-[var(--dome-text-muted)]"
              textareaClassName="bg-[var(--dome-bg)] text-[var(--dome-text)] border-[var(--dome-border)] rounded-xl resize-none font-mono text-xs leading-relaxed"
            />
          </div>
        )}

        {step === 'capabilities' && (
          <div className="flex flex-col gap-6">
            <DomeCallout tone="info" className="!text-xs" title="Capacidades del equipo">
              Puedes añadir tools y MCPs al nivel del equipo. Se sumarán a las capacidades de los agentes miembros y
              compartirán la misma configuración global de tools MCP.
            </DomeCallout>

            <section>
              <DomeSectionLabel compact={false} className="mb-3 !text-sm !normal-case !tracking-normal text-[var(--dome-text)]">
                Tools del equipo
              </DomeSectionLabel>
              <AgentToolsStep selectedIds={toolIds} onChange={setToolIds} />
            </section>

            <section>
              <DomeSectionLabel compact={false} className="mb-3 !text-sm !normal-case !tracking-normal text-[var(--dome-text)]">
                MCP del equipo
              </DomeSectionLabel>
              <AgentMcpStep selectedIds={mcpServerIds} onChange={setMcpServerIds} />
            </section>
          </div>
        )}

        {step === 'icon' && (
          <div className="flex flex-col gap-4">
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              Elige un icono para representar este equipo
            </p>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: ICON_COUNT }, (_, i) => i + 1).map((idx) => (
                <DomeButton
                  key={idx}
                  type="button"
                  variant="ghost"
                  className={cn(
                    'aspect-square !p-1 rounded-xl overflow-hidden h-auto min-h-0 min-w-0',
                    iconIndex === idx && 'ring-2 ring-[var(--accent)]',
                  )}
                  style={
                    iconIndex === idx
                      ? { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, var(--bg-secondary))' }
                      : undefined
                  }
                  onClick={() => setIconIndex(idx)}
                >
                  <img
                    src={`/agents/sprite_${idx}.png`}
                    alt={`Icono ${idx}`}
                    className="w-full h-full object-contain"
                  />
                </DomeButton>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-[var(--error)]">{error}</p>}
      </div>

      <DomeSubpageFooter
        className="!px-6 !py-4"
        leading={
          <DomeButton
            type="button"
            variant="outline"
            size="md"
            onClick={currentStepIndex === 0 ? onCancel : handleBack}
            leftIcon={currentStepIndex === 0 ? undefined : <ChevronLeft className="w-4 h-4" />}
          >
            {currentStepIndex === 0 ? 'Cancelar' : 'Atrás'}
          </DomeButton>
        }
        trailing={
          step === 'icon' ? (
            <DomeButton
              type="button"
              variant="primary"
              size="md"
              onClick={() => void handleCreate()}
              disabled={isCreating}
              loading={isCreating}
              leftIcon={!isCreating ? <Users className="w-4 h-4" /> : undefined}
            >
              {isCreating ? 'Creando...' : 'Crear equipo'}
            </DomeButton>
          ) : (
            <DomeButton
              type="button"
              variant="primary"
              size="md"
              onClick={handleNext}
              disabled={!canProceed()}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Siguiente
            </DomeButton>
          )
        }
      />
    </div>
  );
}
