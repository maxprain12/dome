import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { parseManyAgentMode } from '@/lib/many/agentMode';
import {
  OTHER_OPTION_VALUE,
  extractPlanDocument,
  formatExecutePrompt,
  questionnaireFromActionRequests,
  type PlanTodo,
  type QuestionnaireAnswer,
  type QuestionnaireQuestion,
} from '@/lib/many/planDocument';
import type { RunPendingApproval } from '@/lib/chat/useAgentRunStream';
import { useManyStore } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';

const SUBMIT_TAB = '__submit__';

export type ManyPlanDockPhase = 'questionnaire' | 'choose' | 'executing' | 'parked';

export interface ManyPlanDockProps {
  questions?: QuestionnaireQuestion[];
  todos?: PlanTodo[];
  phase: ManyPlanDockPhase | null;
  busy?: boolean;
  onSubmitQuestionnaire?: (answers: QuestionnaireAnswer[]) => void;
  onCancelQuestionnaire?: () => void;
  onExecute?: () => void;
  onStay?: () => void;
  onRefine?: () => void;
}

export function ManyPlanDock({
  questions = [],
  todos = [],
  phase,
  busy = false,
  onSubmitQuestionnaire,
  onCancelQuestionnaire,
  onExecute,
  onStay,
  onRefine,
}: ManyPlanDockProps) {
  if (!phase || phase === 'parked') return null;
  if (phase === 'questionnaire' && questions.length === 0) return null;
  if ((phase === 'choose' || phase === 'executing') && todos.length === 0) return null;

  return (
    <div className="border-t bg-background px-3 py-3">
      {phase === 'questionnaire' ? (
        <QuestionnairePane
          questions={questions}
          busy={busy}
          onSubmit={onSubmitQuestionnaire}
          onCancel={onCancelQuestionnaire}
        />
      ) : (
        <PlanChoicePane
          todos={todos}
          executing={phase === 'executing'}
          showActions={phase === 'choose'}
          busy={busy}
          onExecute={onExecute}
          onStay={onStay}
          onRefine={onRefine}
        />
      )}
    </div>
  );
}

interface ManyPlanDockHostProps {
  pendingApproval: RunPendingApproval | null;
  onExecute: (prompt: string) => void;
  onRefineRequest: () => void;
}

export function ManyPlanDockHost({
  pendingApproval,
  onExecute,
  onRefineRequest,
}: ManyPlanDockHostProps) {
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const agentModeBySession = useManyStore((s) => s.agentModeBySession);
  const planTodosBySession = useManyStore((s) => s.planTodosBySession);
  const planDocumentBySession = useManyStore((s) => s.planDocumentBySession);
  const planExecutingBySession = useManyStore((s) => s.planExecutingBySession);
  const planChoiceOpenBySession = useManyStore((s) => s.planChoiceOpenBySession);
  const setAgentModeForSession = useManyStore((s) => s.setAgentModeForSession);
  const setPlanExecutingForSession = useManyStore((s) => s.setPlanExecutingForSession);
  const setPlanChoiceOpenForSession = useManyStore((s) => s.setPlanChoiceOpenForSession);
  const setPlanDocumentForSession = useManyStore((s) => s.setPlanDocumentForSession);
  const lastAssistantText = useManyStore((s) => {
    const id = s.currentSessionId;
    if (!id) return '';
    const messages = s.sessions.find((row) => row.id === id)?.messages ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'assistant' && message.content?.trim()) return message.content;
    }
    return '';
  });

  const questions = useMemo(
    () => questionnaireFromActionRequests(pendingApproval?.actionRequests),
    [pendingApproval],
  );
  const todos = currentSessionId ? planTodosBySession[currentSessionId] ?? [] : [];
  const document = currentSessionId ? planDocumentBySession[currentSessionId] : undefined;
  const executing = currentSessionId ? planExecutingBySession[currentSessionId] === true : false;
  const choiceOpen = currentSessionId ? planChoiceOpenBySession[currentSessionId] !== false : false;
  const agentMode = parseManyAgentMode(
    currentSessionId ? agentModeBySession[currentSessionId] : 'agent',
  );

  useEffect(() => {
    if (!currentSessionId || agentMode !== 'plan' || todos.length > 0 || !lastAssistantText) return;
    const recovered = extractPlanDocument(lastAssistantText);
    if (recovered) {
      setPlanDocumentForSession(currentSessionId, recovered);
      setPlanChoiceOpenForSession(currentSessionId, true);
    }
  }, [agentMode, currentSessionId, lastAssistantText, setPlanChoiceOpenForSession, setPlanDocumentForSession, todos.length]);

  let phase: ManyPlanDockPhase | null = null;
  if (questions.length > 0) phase = 'questionnaire';
  else if (executing && todos.length > 0) phase = 'executing';
  else if (agentMode === 'plan' && todos.length > 0 && choiceOpen) phase = 'choose';

  return (
    <ManyPlanDock
      questions={questions}
      todos={todos}
      phase={phase}
      onSubmitQuestionnaire={(answers) => {
        pendingApproval?.submitResume([{ type: 'approve', answers }]);
      }}
      onCancelQuestionnaire={() => {
        pendingApproval?.submitResume([{ type: 'reject', cancelled: true }]);
      }}
      onExecute={() => {
        if (!currentSessionId) return;
        setAgentModeForSession(currentSessionId, 'agent');
        setPlanExecutingForSession(currentSessionId, true);
        setPlanChoiceOpenForSession(currentSessionId, false);
        onExecute(formatExecutePrompt(todos, document?.body));
      }}
      onStay={() => {
        if (!currentSessionId) return;
        setPlanChoiceOpenForSession(currentSessionId, false);
      }}
      onRefine={() => {
        onRefineRequest();
      }}
    />
  );
}

function QuestionnairePane({
  questions,
  busy,
  onSubmit,
  onCancel,
}: {
  questions: QuestionnaireQuestion[];
  busy: boolean;
  onSubmit?: (answers: QuestionnaireAnswer[]) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const multi = questions.length > 1;
  const [tab, setTab] = useState(questions[0]?.id ?? SUBMIT_TAB);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [typingOther, setTypingOther] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setTab(questions[0]?.id ?? SUBMIT_TAB);
    setSelected({});
    setCustom({});
    setTypingOther({});
  }, [questions]);

  const answered = useCallback(
    (question: QuestionnaireQuestion) => {
      const value = selected[question.id];
      if (!value) return false;
      if (value === OTHER_OPTION_VALUE) return Boolean(custom[question.id]?.trim());
      return true;
    },
    [custom, selected],
  );

  const allAnswered = questions.every(answered);
  const current = questions.find((row) => row.id === tab) ?? questions[0];
  const showingSubmit = multi && tab === SUBMIT_TAB;

  const buildAnswers = useCallback((): QuestionnaireAnswer[] => {
    return questions.flatMap((question): QuestionnaireAnswer[] => {
      const value = selected[question.id];
      if (!value) return [];
      if (value === OTHER_OPTION_VALUE) {
        const label = custom[question.id]?.trim() || '';
        if (!label) return [];
        return [{ id: question.id, value: label, label, wasCustom: true }];
      }
      const index = question.options.findIndex((option) => option.value === value);
      const option = index >= 0 ? question.options[index] : null;
      if (!option) return [];
      return [
        {
          id: question.id,
          value: option.value,
          label: option.label,
          wasCustom: false,
          index: index + 1,
        },
      ];
    });
  }, [custom, questions, selected]);

  const submit = useCallback(() => {
    if (!allAnswered || busy) return;
    onSubmit?.(buildAnswers());
  }, [allAnswered, buildAnswers, busy, onSubmit]);

  const advance = useCallback(() => {
    if (!current) return;
    if (!answered(current)) return;
    if (!multi) {
      submit();
      return;
    }
    const idx = questions.findIndex((row) => row.id === current.id);
    const next = questions[idx + 1];
    setTab(next ? next.id : SUBMIT_TAB);
  }, [answered, current, multi, questions, submit]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (current && typingOther[current.id]) {
        setTypingOther((prev) => ({ ...prev, [current.id]: false }));
        setSelected((prev) => {
          const next = { ...prev };
          delete next[current.id];
          return next;
        });
        return;
      }
      onCancel?.();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (showingSubmit) {
      submit();
      return;
    }
    advance();
  };

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      {multi ? (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('many.plan_ready')}>
          {questions.map((question) => {
            const done = answered(question);
            const active = tab === question.id;
            return (
              <button
                key={question.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs',
                  active
                    ? 'border-foreground/20 bg-muted text-foreground'
                    : 'border-border bg-background text-muted-foreground',
                )}
                onClick={() => setTab(question.id)}
              >
                {done ? '■' : '□'} {question.label}
              </button>
            );
          })}
          <button
            type="button"
            role="tab"
            aria-selected={showingSubmit}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs',
              showingSubmit
                ? 'border-foreground/20 bg-muted text-foreground'
                : 'border-border bg-background text-muted-foreground',
            )}
            onClick={() => setTab(SUBMIT_TAB)}
          >
            {t('many.plan_question_submit')}
          </button>
        </div>
      ) : null}

      {showingSubmit ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground">{t('many.plan_what_next')}</p>
          <p className="text-xs text-muted-foreground">
            {allAnswered ? t('many.plan_question_submit') : t('many.plan_empty')}
          </p>
        </div>
      ) : current ? (
        <QuestionOptions
          question={current}
          selected={selected[current.id] ?? ''}
          custom={custom[current.id] ?? ''}
          typingOther={typingOther[current.id] === true}
          onSelect={(value) => {
            setSelected((prev) => ({ ...prev, [current.id]: value }));
            setTypingOther((prev) => ({ ...prev, [current.id]: value === OTHER_OPTION_VALUE }));
          }}
          onCustom={(value) => setCustom((prev) => ({ ...prev, [current.id]: value }))}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showingSubmit ? (
          <Button type="button" size="sm" disabled={!allAnswered || busy} onClick={submit}>
            {t('many.plan_question_submit')}
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={!current || !answered(current) || busy} onClick={advance}>
            {t('many.plan_continue')}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('many.plan_cancel')}
        </Button>
      </div>
    </div>
  );
}

function QuestionOptions({
  question,
  selected,
  custom,
  typingOther,
  onSelect,
  onCustom,
}: {
  question: QuestionnaireQuestion;
  selected: string;
  custom: string;
  typingOther: boolean;
  onSelect: (value: string) => void;
  onCustom: (value: string) => void;
}) {
  const { t } = useTranslation();
  const otherValue = OTHER_OPTION_VALUE;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-foreground">{question.prompt}</p>
      {typingOther ? (
        <Input
          autoFocus
          value={custom}
          onChange={(event) => onCustom(event.target.value)}
          placeholder={t('many.plan_type_something')}
          aria-label={t('many.plan_type_something')}
        />
      ) : (
            <RadioGroup value={selected} onValueChange={(value) => { if (value) onSelect(value); }} className="gap-2">
          {question.options.map((option, index) => (
            <label
              key={option.value}
              className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-muted/60"
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">
                  {index + 1}. {option.label}
                </span>
                {option.description ? (
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </label>
          ))}
          {question.allowOther ? (
            <label className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-muted/60">
              <RadioGroupItem value={otherValue} className="mt-0.5" />
              <span className="text-sm text-foreground">
                {question.options.length + 1}. {t('many.plan_type_something')}
              </span>
            </label>
          ) : null}
        </RadioGroup>
      )}
    </div>
  );
}

function PlanChoicePane({
  todos,
  executing,
  showActions,
  busy,
  onExecute,
  onStay,
  onRefine,
}: {
  todos: PlanTodo[];
  executing: boolean;
  showActions: boolean;
  busy: boolean;
  onExecute?: () => void;
  onStay?: () => void;
  onRefine?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground">
        {executing
          ? t('many.plan_progress', {
              done: todos.filter((item) => item.completed).length,
              count: todos.length,
            })
          : t('many.plan_what_next')}
      </p>
      {executing || !showActions ? null : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={onExecute}>
            {t('many.plan_execute')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onStay}>
            {t('many.plan_stay')}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRefine}>
            {t('many.plan_refine')}
          </Button>
        </div>
      )}
    </div>
  );
}
