'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronLeft, X, Users, Cpu, Check } from 'lucide-react';
import type { ManyAgent, AgentTeam } from '@/types';
import { getManyAgents } from '@/lib/agents/api';
import { createAgentTeam } from '@/lib/agent-team/api';
import AgentMcpStep from '@/components/agents/steps/AgentMcpStep';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeSubpageFooter from '@/components/ui/DomeSubpageFooter';
import { cn } from '@/lib/utils';

type Step = 'basics' | 'members' | 'capabilities' | 'supervisor' | 'icon';

const STEP_ORDER: Step[] = ['basics', 'members', 'capabilities', 'supervisor', 'icon'];

const ICON_COUNT = 18;
const MAX_MEMBERS = 5;

interface AgentTeamOnboardingProps {
  onComplete: (team: AgentTeam) => void;
  onCancel: () => void;
}

export default function AgentTeamOnboarding({ onComplete, onCancel }: AgentTeamOnboardingProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('basics');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [supervisorInstructions, setSupervisorInstructions] = useState('');
  const [iconIndex, setIconIndex] = useState(1);
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepLabels = useMemo(
    (): Record<Step, string> => ({
      basics: t('agentTeam.step_basics'),
      members: t('agentTeam.step_members'),
      capabilities: t('agentTeam.step_capabilities'),
      supervisor: t('agentTeam.step_supervisor'),
      icon: t('agentTeam.step_icon'),
    }),
    [t],
  );

  useEffect(() => {
    setSupervisorInstructions(t('agentTeam.default_supervisor_instructions'));
  }, [t]);

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
        mcpServerIds,
        iconIndex,
      });
      if (result.success && result.data) {
        onComplete(result.data);
      } else {
        setError(result.error ?? t('agentTeam.create_error'));
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
          : prev,
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--dome-border)] bg-[var(--dome-bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="size-4 text-[var(--dome-accent)] shrink-0" aria-hidden />
          <h1 className="text-base font-semibold text-[var(--dome-text)] truncate">{t('agentTeam.new_team_title')}</h1>
        </div>
        <DomeButton type="button" variant="ghost" size="sm" iconOnly onClick={onCancel} aria-label={t('common.close')}>
          <X className="size-4" />
        </DomeButton>
      </header>

      <div className="flex items-center gap-1 px-6 py-3 shrink-0">
        {STEP_ORDER.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className="flex items-center justify-center size-6 rounded-full text-xs font-medium transition-all"
              style={{
                background:
                  s === step
                    ? 'var(--dome-accent)'
                    : i < currentStepIndex
                      ? 'color-mix(in srgb, var(--dome-accent) 18%, var(--dome-surface))'
                      : 'var(--dome-border)',
                color:
                  s === step
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
              style={{ color: s === step ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}
            >
              {stepLabels[s]}
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

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {step === 'basics' && (
          <div className="flex flex-col gap-4">
            <DomeInput
              label={t('agentTeam.team_name_label')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agentTeam.team_name_placeholder')}
            />
            <DomeTextarea
              label={t('agentTeam.team_description_label')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('agentTeam.team_description_placeholder')}
              rows={3}
            />
          </div>
        )}

        {step === 'members' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('agentTeam.members_hint', { max: MAX_MEMBERS, count: selectedAgentIds.length })}
            </p>
            {agents.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                {t('agentTeam.no_agents')}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {agents.map((agent) => {
                  const selected = selectedAgentIds.includes(agent.id);
                  const disabled = !selected && selectedAgentIds.length >= MAX_MEMBERS;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        'flex items-center gap-3 transition-all cursor-pointer border rounded-xl bg-[var(--bg-secondary)] p-3 w-full text-left border-[var(--dome-border)]',
                        selected && 'ring-2 ring-[var(--dome-accent)]',
                        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
                      )}
                      style={
                        selected
                          ? { backgroundColor: 'color-mix(in srgb, var(--dome-accent) 12%, var(--dome-surface))' }
                          : undefined
                      }
                      onClick={() => !disabled && toggleAgent(agent.id)}
                    >
                      <img
                        src={`/agents/sprite_${agent.iconIndex}.png`}
                        alt=""
                        className="size-9 shrink-0 rounded-lg object-contain"
                        style={{ background: 'var(--dome-surface)' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                          {agent.name}
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--dome-text-muted)' }}>
                          {agent.description || t('agentTeam.no_description')}
                        </div>
                      </div>
                      <div
                        className="size-5 rounded-full shrink-0 flex items-center justify-center"
                        style={{
                          background: selected ? 'var(--dome-accent)' : 'var(--dome-border)',
                          color: 'var(--base-text)',
                        }}
                      >
                        {selected && <Check size={12} />}
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
            <DomeCallout tone="info" className="!text-xs" title={t('agentTeam.supervisor_role_title')}>
              {t('agentTeam.supervisor_role_desc')}
            </DomeCallout>
            <DomeTextarea
              label={t('agentTeam.supervisor_instructions_label')}
              value={supervisorInstructions}
              onChange={(e) => setSupervisorInstructions(e.target.value)}
              rows={10}
              textareaClassName="font-mono text-xs leading-relaxed"
            />
          </div>
        )}

        {step === 'capabilities' && (
          <div className="flex flex-col gap-6">
            <DomeCallout tone="info" className="!text-xs" title={t('agentTeam.capabilities_title')}>
              {t('agentTeam.capabilities_mcp_hint')}
            </DomeCallout>

            <section>
              <DomeSectionLabel compact={false} className="mb-3 !text-sm !normal-case !tracking-normal text-[var(--dome-text)]">
                {t('onboarding.step_mcp')}
              </DomeSectionLabel>
              <AgentMcpStep selectedIds={mcpServerIds} onChange={setMcpServerIds} />
            </section>
          </div>
        )}

        {step === 'icon' && (
          <div className="flex flex-col gap-4">
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('agentTeam.icon_hint')}
            </p>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: ICON_COUNT }, (_, i) => i + 1).map((idx) => (
                <DomeButton
                  key={idx}
                  type="button"
                  variant="ghost"
                  className={cn(
                    'aspect-square !p-1 rounded-xl overflow-hidden h-auto min-h-0 min-w-0',
                    iconIndex === idx && 'ring-2 ring-[var(--dome-accent)]',
                  )}
                  style={
                    iconIndex === idx
                      ? { backgroundColor: 'color-mix(in srgb, var(--dome-accent) 12%, var(--dome-surface))' }
                      : undefined
                  }
                  onClick={() => setIconIndex(idx)}
                >
                  <img src={`/agents/sprite_${idx}.png`} alt={`Icon ${idx}`} className="size-full object-contain" />
                </DomeButton>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-[var(--dome-error)]">{error}</p>}
      </div>

      <DomeSubpageFooter
        className="!px-6 !py-4"
        leading={
          <DomeButton
            type="button"
            variant="outline"
            size="md"
            onClick={currentStepIndex === 0 ? onCancel : handleBack}
            leftIcon={currentStepIndex === 0 ? undefined : <ChevronLeft className="size-4" />}
          >
            {currentStepIndex === 0 ? t('common.cancel') : t('common.back')}
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
              leftIcon={!isCreating ? <Users className="size-4" /> : undefined}
            >
              {isCreating ? t('agentTeam.creating') : t('agentTeam.create_team')}
            </DomeButton>
          ) : (
            <DomeButton
              type="button"
              variant="primary"
              size="md"
              onClick={handleNext}
              disabled={!canProceed()}
              rightIcon={<ChevronRight className="size-4" />}
            >
              {t('onboarding.continue')}
            </DomeButton>
          )
        }
      />
    </div>
  );
}
