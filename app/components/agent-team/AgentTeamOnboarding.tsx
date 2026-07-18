'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  Cancel01Icon,
  UserMultiple02Icon,
  CpuIcon,
  CheckIcon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { ManyAgent, AgentTeam } from '@/types';
import { getManyAgents } from '@/lib/agents/api';
import { createAgentTeam } from '@/lib/agent-team/api';
import AgentMcpStep from '@/components/agents/steps/AgentMcpStep';
import SubpageFooter from '@/components/shared/SubpageFooter';
import { cn } from '@/lib/utils';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
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
      <header className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center gap-2 min-w-0">
          <HugeiconsIcon icon={CpuIcon} className="size-4 text-primary shrink-0" aria-hidden />
          <h1 className="text-base font-semibold text-foreground truncate">{t('agentTeam.new_team_title')}</h1>
        </div>
        <Button type="button"
  variant="ghost"
  onClick={onCancel}
  aria-label={t('common.close')}
  size="icon-sm">
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </header>

      <div className="flex items-center gap-1 px-6 py-3 shrink-0">
        {STEP_ORDER.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className="flex items-center justify-center size-6 rounded-full text-xs font-medium transition-colors"
              style={{
                background:
                  s === step
                    ? 'var(--primary)'
                    : i < currentStepIndex
                      ? 'color-mix(in srgb, var(--primary) 18%, var(--card))'
                      : 'var(--border)',
                color:
                  s === step
                    ? 'var(--primary-foreground)'
                    : i < currentStepIndex
                      ? 'var(--primary)'
                      : 'var(--muted-foreground)',
              }}
            >
              {i < currentStepIndex ? <HugeiconsIcon icon={CheckIcon} size={12} /> : i + 1}
            </div>
            <span
              className="text-xs hidden sm:inline"
              style={{ color: s === step ? 'var(--foreground)' : 'var(--muted-foreground)' }}
            >
              {stepLabels[s]}
            </span>
            {i < STEP_ORDER.length - 1 && (
              <div
                className="w-4 h-0.5 mx-1"
                style={{
                  background: i < currentStepIndex ? 'var(--primary)' : 'var(--border)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {step === 'basics' && (
          <div className="flex flex-col gap-4">
            <Field className="gap-1.5"><FieldLabel htmlFor="fld-input-12" className="text-xs">{t('agentTeam.team_name_label')}</FieldLabel><Input id="fld-input-12" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('agentTeam.team_name_placeholder')} /></Field>
            <Field className="gap-1.5"><FieldLabel htmlFor="fld-textarea-2" className="text-xs">{t('agentTeam.team_description_label')}</FieldLabel><Textarea id="fld-textarea-2" className="min-h-24 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('agentTeam.team_description_placeholder')} rows={3} /></Field>
          </div>
        )}

        {step === 'members' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {t('agentTeam.members_hint', { max: MAX_MEMBERS, count: selectedAgentIds.length })}
            </p>
            {agents.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
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
                        'flex items-center gap-3 transition-[box-shadow,opacity] cursor-pointer border rounded-xl bg-card p-3 w-full text-left border-border',
                        selected && 'ring-2 ring-primary',
                        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
                      )}
                      style={
                        selected
                          ? { backgroundColor: 'color-mix(in srgb, var(--primary) 12%, var(--card))' }
                          : undefined
                      }
                      onClick={() => !disabled && toggleAgent(agent.id)}
                    >
                      <img
                        src={`/agents/sprite_${agent.iconIndex}.png`}
                        alt=""
                        className="size-9 shrink-0 rounded-lg object-contain bg-card"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-foreground">
                          {agent.name}
                        </div>
                        <div className="text-xs truncate text-muted-foreground">
                          {agent.description || t('agentTeam.no_description')}
                        </div>
                      </div>
                      <div
                        className="size-5 rounded-full shrink-0 flex items-center justify-center"
                        style={{
                          background: selected ? 'var(--primary)' : 'var(--border)',
                          color: 'var(--primary-foreground)',
                        }}
                      >
                        {selected && <HugeiconsIcon icon={CheckIcon} size={12} />}
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
            <Alert className="!text-xs" role="note"><HugeiconsIcon icon={InformationCircleIcon} aria-hidden /><AlertTitle className="text-xs">{t('agentTeam.supervisor_role_title')}</AlertTitle><AlertDescription className="text-xs">
              {t('agentTeam.supervisor_role_desc')}
            </AlertDescription></Alert>
            <Field className="gap-1.5"><FieldLabel htmlFor="fld-textarea-3" className="text-xs">{t('agentTeam.supervisor_instructions_label')}</FieldLabel><Textarea id="fld-textarea-3" className="min-h-24 resize-y font-mono text-xs leading-relaxed" value={supervisorInstructions} onChange={(e) => setSupervisorInstructions(e.target.value)} rows={10} /></Field>
          </div>
        )}

        {step === 'capabilities' && (
          <div className="flex flex-col gap-6">
            <Alert className="!text-xs" role="note"><HugeiconsIcon icon={InformationCircleIcon} aria-hidden /><AlertTitle className="text-xs">{t('agentTeam.capabilities_title')}</AlertTitle><AlertDescription className="text-xs">
              {t('agentTeam.capabilities_mcp_hint')}
            </AlertDescription></Alert>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 !text-sm !normal-case !tracking-normal text-foreground">
                {t('onboarding.step_mcp')}
              </p>
              <AgentMcpStep selectedIds={mcpServerIds} onChange={setMcpServerIds} />
            </section>
          </div>
        )}

        {step === 'icon' && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              {t('agentTeam.icon_hint')}
            </p>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: ICON_COUNT }, (_, i) => i + 1).map((idx) => (
                <Button key={idx}
  type="button"
  variant="ghost"
  className={cn(
                    'aspect-square !p-1 rounded-xl overflow-hidden h-auto min-h-0 min-w-0',
                    iconIndex === idx && 'ring-2 ring-primary',
                  )}
  style={
                    iconIndex === idx
                      ? { backgroundColor: 'color-mix(in srgb, var(--primary) 12%, var(--card))' }
                      : undefined
                  }
  onClick={() => setIconIndex(idx)}>
                  <img src={`/agents/sprite_${idx}.png`} alt={`Icon ${idx}`} className="size-full object-contain" />
                </Button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </div>

      <SubpageFooter className="!px-6 !py-4">
        <SubpageFooter.Leading>
          <Button type="button"
  variant="outline"
  onClick={currentStepIndex === 0 ? onCancel : handleBack}>{currentStepIndex === 0 ? undefined : <HugeiconsIcon icon={ChevronLeftIcon} className="size-4" />}
            {currentStepIndex === 0 ? t('common.cancel') : t('common.back')}
          </Button>
        </SubpageFooter.Leading>
        <SubpageFooter.Trailing>
          {step === 'icon' ? (
            <Button type="button"
  onClick={() => void handleCreate()}
  disabled={isCreating}
  loading={isCreating}>{!isCreating ? <HugeiconsIcon icon={UserMultiple02Icon} className="size-4" /> : undefined}
              {isCreating ? t('agentTeam.creating') : t('agentTeam.create_team')}
            </Button>
          ) : (
            <Button type="button"
  onClick={handleNext}
  disabled={!canProceed()}>
              {t('onboarding.continue')}
            {<HugeiconsIcon icon={ChevronRightIcon} className="size-4" />}</Button>
          )}
        </SubpageFooter.Trailing>
      </SubpageFooter>
    </div>
  );
}
