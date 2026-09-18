import { useEffect, useMemo } from 'react';
import { parseManyAgentMode } from '@/lib/many/agentMode';
import {
  extractPlanDocument,
  formatExecutePrompt,
  questionnaireFromActionRequests,
} from '@/lib/many/planDocument';
import type { RunPendingApproval } from '@/lib/chat/useAgentRunStream';
import { useManyStore } from '@/lib/store/useManyStore';
import { ManyPlanDock, type ManyPlanDockPhase } from './ManyPlanDock';

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
