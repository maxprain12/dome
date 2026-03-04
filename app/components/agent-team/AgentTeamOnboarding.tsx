'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, X, Users, Cpu, FileText, Image } from 'lucide-react';
import type { ManyAgent, AgentTeam } from '@/types';
import { getManyAgents } from '@/lib/agents/api';
import { createAgentTeam } from '@/lib/agent-team/api';

type Step = 'basics' | 'members' | 'supervisor' | 'icon';

const STEP_ORDER: Step[] = ['basics', 'members', 'supervisor', 'icon'];

const STEP_LABELS: Record<Step, string> = {
  basics: 'Nombre',
  members: 'Agentes',
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
  const [step, setStep] = useState<Step>('basics');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
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
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4" style={{ color: 'var(--dome-accent, #6366f1)' }} />
          <span className="font-semibold text-sm" style={{ color: 'var(--dome-text)' }}>
            Nuevo Agent Team
          </span>
        </div>
        <button
          onClick={onCancel}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
          style={{ color: 'var(--dome-text-muted)', background: 'var(--dome-bg)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-1 px-6 py-3 shrink-0">
        {STEP_ORDER.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-all"
              style={{
                background:
                  s === step
                    ? 'var(--dome-accent, #6366f1)'
                    : i < currentStepIndex
                    ? 'var(--dome-accent-bg)'
                    : 'var(--dome-border)',
                color:
                  s === step
                    ? 'white'
                    : i < currentStepIndex
                    ? 'var(--dome-accent, #6366f1)'
                    : 'var(--dome-text-muted)',
              }}
            >
              {i < currentStepIndex ? '✓' : i + 1}
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
                style={{ background: i < currentStepIndex ? 'var(--dome-accent, #6366f1)' : 'var(--dome-border)' }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {step === 'basics' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                Nombre del equipo *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Equipo de Investigación"
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--dome-bg)',
                  color: 'var(--dome-text)',
                  border: '1px solid var(--dome-border)',
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                Descripción (opcional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="¿Qué hace este equipo?"
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{
                  background: 'var(--dome-bg)',
                  color: 'var(--dome-text)',
                  border: '1px solid var(--dome-border)',
                }}
              />
            </div>
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
                    <button
                      key={agent.id}
                      onClick={() => !disabled && toggleAgent(agent.id)}
                      disabled={disabled}
                      className="flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                      style={{
                        background: selected ? 'var(--dome-accent-bg)' : 'var(--dome-bg)',
                        border: `1px solid ${selected ? 'var(--dome-accent, #6366f1)' : 'var(--dome-border)'}`,
                        opacity: disabled ? 0.4 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
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
                          background: selected ? 'var(--dome-accent, #6366f1)' : 'var(--dome-border)',
                          color: 'white',
                        }}
                      >
                        {selected && <span className="text-xs">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 'supervisor' && (
          <div className="flex flex-col gap-4">
            <div
              className="flex items-start gap-2 p-3 rounded-xl text-xs"
              style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent, #6366f1)' }}
            >
              <FileText className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                El supervisor recibe la tarea del usuario y coordina los agentes del equipo. Define cómo quieres que organice y distribuya el trabajo.
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                Instrucciones del supervisor *
              </label>
              <textarea
                value={supervisorInstructions}
                onChange={(e) => setSupervisorInstructions(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none font-mono"
                style={{
                  background: 'var(--dome-bg)',
                  color: 'var(--dome-text)',
                  border: '1px solid var(--dome-border)',
                  fontSize: '12px',
                  lineHeight: '1.6',
                }}
              />
            </div>
          </div>
        )}

        {step === 'icon' && (
          <div className="flex flex-col gap-4">
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              Elige un icono para representar este equipo
            </p>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: ICON_COUNT }, (_, i) => i + 1).map((idx) => (
                <button
                  key={idx}
                  onClick={() => setIconIndex(idx)}
                  className="aspect-square rounded-xl overflow-hidden transition-all"
                  style={{
                    border: `2px solid ${iconIndex === idx ? 'var(--dome-accent, #6366f1)' : 'transparent'}`,
                    background: iconIndex === idx ? 'var(--dome-accent-bg)' : 'var(--dome-bg)',
                    padding: '4px',
                  }}
                >
                  <img
                    src={`/agents/sprite_${idx}.png`}
                    alt={`Icono ${idx}`}
                    className="w-full h-full object-contain"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-red-500">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between gap-3 px-6 py-4 shrink-0"
        style={{ borderTop: '1px solid var(--dome-border)' }}
      >
        <button
          onClick={currentStepIndex === 0 ? onCancel : handleBack}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-all"
          style={{
            background: 'var(--dome-bg)',
            color: 'var(--dome-text)',
            border: '1px solid var(--dome-border)',
          }}
        >
          {currentStepIndex === 0 ? (
            'Cancelar'
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              Atrás
            </>
          )}
        </button>

        {step === 'icon' ? (
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'var(--dome-accent, #6366f1)',
              color: 'white',
              opacity: isCreating ? 0.7 : 1,
              cursor: isCreating ? 'not-allowed' : 'pointer',
            }}
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                Crear equipo
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: canProceed() ? 'var(--dome-accent, #6366f1)' : 'var(--dome-border)',
              color: canProceed() ? 'white' : 'var(--dome-text-muted)',
              cursor: canProceed() ? 'pointer' : 'not-allowed',
            }}
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
