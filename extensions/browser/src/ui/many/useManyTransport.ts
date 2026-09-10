import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  ManyComposerImage,
} from '../../../../../app/components/many/composer/ManyComposerSurface';
import type {
  ManyConversationSurfaceMessage,
  ManySurfaceToolCall,
} from '../../../../../app/components/many/conversation/ManyConversationSurface';
import {
  createToolRunner,
  type ToolRequest,
  type ToolReview,
} from '../../lib/agent-tools';
import * as api from '../../lib/client';
import {
  formatUsage,
  parseToolArguments,
  updateTool,
} from './manyAssistantUtils';
import type {
  CompactionState,
  PendingApproval,
  RunExecution,
  RunPhase,
} from './types';

interface StartRun {
  displayPrompt: string;
  images: ManyComposerImage[];
  buildBody: (streamId: string) => api.ManyStreamBody;
  onStarted: () => Promise<void>;
}

interface UseManyTransportOptions {
  token: string;
  projectId: string;
  tabId?: number;
  setMessages: Dispatch<SetStateAction<ManyConversationSurfaceMessage[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setUsage: Dispatch<SetStateAction<api.TokenUsage | null>>;
  setBudget: Dispatch<SetStateAction<api.BudgetBreakdown | null>>;
  setCompaction: Dispatch<SetStateAction<CompactionState | null>>;
  refreshSessions: () => Promise<void>;
  errorLabel: string;
}

export function useManyTransport({
  token,
  projectId,
  tabId,
  setMessages,
  setError,
  setUsage,
  setBudget,
  setCompaction,
  refreshSessions,
  errorLabel,
}: UseManyTransportOptions) {
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);
  const [approvalEditOpen, setApprovalEditOpen] = useState(false);
  const [approvalEditArgs, setApprovalEditArgs] = useState('');
  const [review, setReview] = useState<
    (ToolReview & { resolve: (approved: boolean) => void }) | null
  >(null);
  const generationRef = useRef(0);
  const activeExecutionRef = useRef<RunExecution | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const reviewRef = useRef<((approved: boolean) => void) | null>(null);

  const running = phase === 'running' || phase === 'resuming';
  const interactionLocked = phase !== 'idle' || pendingApproval !== null;

  const isCurrentExecution = useCallback((execution: RunExecution) => {
    const active = activeExecutionRef.current;
    return (
      active?.streamId === execution.streamId &&
      active.messageId === execution.messageId &&
      active.generation === execution.generation &&
      generationRef.current === execution.generation
    );
  }, []);

  const updateExecutionMessage = useCallback(
    (
      execution: RunExecution,
      update: (
        message: ManyConversationSurfaceMessage,
      ) => ManyConversationSurfaceMessage,
    ) => {
      if (!isCurrentExecution(execution)) return;
      setMessages((previous) =>
        previous.map((message) =>
          message.id === execution.messageId ? update(message) : message,
        ),
      );
    },
    [isCurrentExecution, setMessages],
  );

  const handleStreamEvent = useCallback(
    (execution: RunExecution, event: api.ManyStreamEvent) => {
      if (!isCurrentExecution(execution)) return;
      switch (event.type) {
        case 'start':
        case 'harness':
          return;
        case 'delta':
          updateExecutionMessage(execution, (message) => ({
            ...message,
            text: `${message.text}${event.text}`,
          }));
          return;
        case 'reasoning':
          updateExecutionMessage(execution, (message) => ({
            ...message,
            reasoning: `${message.reasoning ?? ''}${event.text}`,
          }));
          return;
        case 'tool_call': {
          const tool: ManySurfaceToolCall = {
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: parseToolArguments(event.toolCall.arguments),
            status: 'running',
          };
          updateExecutionMessage(execution, (message) => ({
            ...message,
            tools: [...(message.tools ?? []), tool],
          }));
          return;
        }
        case 'browser_tool': {
          const tool: ManySurfaceToolCall = {
            id: event.callId,
            name: event.name,
            arguments: event.args,
            status: 'running',
          };
          updateExecutionMessage(execution, (message) => ({
            ...message,
            tools: [...(message.tools ?? []), tool],
          }));
          return;
        }
        case 'tool_progress':
          setMessages((previous) =>
            updateTool(
              previous,
              execution.messageId,
              event.toolCallId,
              (tool) => ({
                ...tool,
                progress: event.partialResult || event.toolName,
              }),
            ),
          );
          return;
        case 'tool_result':
          setMessages((previous) =>
            updateTool(
              previous,
              execution.messageId,
              event.toolCallId,
              (tool) => ({
                ...tool,
                status: event.isError ? 'error' : 'success',
                result: event.result,
                error: event.isError
                  ? String(event.result ?? errorLabel)
                  : undefined,
              }),
            ),
          );
          return;
        case 'usage':
          setUsage(event.usage);
          updateExecutionMessage(execution, (message) => ({
            ...message,
            usageLabel: formatUsage(event.usage),
          }));
          return;
        case 'budget':
          setBudget(event.breakdown);
          return;
        case 'compaction':
          setCompaction({
            tokensBefore: event.tokensBefore,
            tokensAfter: event.tokensAfter,
            summaryPreview: event.summaryPreview,
            automatic: event.automatic !== false,
          });
          return;
        case 'approval':
          execution.awaitingApproval = true;
          setPendingApproval({
            streamId: execution.streamId,
            messageId: execution.messageId,
            generation: execution.generation,
            actionRequests: event.actionRequests,
            reviewConfigs: event.reviewConfigs,
          });
          setApprovalEditArgs(
            JSON.stringify(event.actionRequests[0]?.args ?? {}, null, 2),
          );
          setApprovalEditOpen(false);
          setPhase('awaiting_approval');
          updateExecutionMessage(execution, (message) => ({
            ...message,
            isStreaming: false,
          }));
          return;
        case 'done':
          updateExecutionMessage(execution, (message) => ({
            ...message,
            isStreaming: false,
          }));
          return;
        case 'error':
          setError(event.error || errorLabel);
          updateExecutionMessage(execution, (message) => ({
            ...message,
            isStreaming: false,
          }));
          return;
        default: {
          const exhaustive: never = event;
          return exhaustive;
        }
      }
    },
    [
      errorLabel,
      isCurrentExecution,
      setBudget,
      setCompaction,
      setError,
      setMessages,
      setUsage,
      updateExecutionMessage,
    ],
  );

  const createBrowserToolHandler = useCallback(
    (execution: RunExecution) => {
      abortController.current = new AbortController();
      const runner = createToolRunner({
        token,
        projectId,
        tabId,
        signal: abortController.current.signal,
        review: (value) =>
          new Promise((resolve) => {
            if (!isCurrentExecution(execution)) {
              resolve(false);
              return;
            }
            reviewRef.current = resolve;
            setReview({
              ...value,
              resolve: (approved) => {
                reviewRef.current = null;
                setReview(null);
                resolve(approved);
              },
            });
          }),
      });
      return async (request: ToolRequest) => {
        if (!isCurrentExecution(execution)) {
          return { success: false, error: 'Run is no longer active' };
        }
        const result = await runner(request);
        return isCurrentExecution(execution)
          ? result
          : { success: false, error: 'Run is no longer active' };
      };
    },
    [isCurrentExecution, projectId, tabId, token],
  );

  const finishTransport = useCallback(
    (execution: RunExecution) => {
      if (!isCurrentExecution(execution)) return;
      updateExecutionMessage(execution, (message) => ({
        ...message,
        isStreaming: false,
      }));
      activeExecutionRef.current = null;
      abortController.current?.abort();
      reviewRef.current?.(false);
      setReview(null);
      setPhase(execution.awaitingApproval ? 'awaiting_approval' : 'idle');
    },
    [isCurrentExecution, updateExecutionMessage],
  );

  const run = async ({
    displayPrompt,
    images,
    buildBody,
    onStarted,
  }: StartRun) => {
    if (interactionLocked) return;
    const streamId = crypto.randomUUID();
    const messageId = `${streamId}:assistant`;
    const execution: RunExecution = {
      streamId,
      messageId,
      generation: generationRef.current + 1,
    };
    generationRef.current = execution.generation;
    activeExecutionRef.current = execution;
    setMessages((previous) => [
      ...previous,
      {
        id: `${streamId}:user`,
        role: 'user',
        text: displayPrompt,
        timestamp: Date.now(),
        images,
      },
      {
        id: messageId,
        role: 'assistant',
        text: '',
        timestamp: Date.now(),
        isStreaming: true,
        tools: [],
      },
    ]);
    setPhase('running');
    setError('');
    setCompaction(null);
    setPendingApproval(null);
    setApprovalEditOpen(false);
    const toolHandler = createBrowserToolHandler(execution);
    try {
      await onStarted();
      const result = await api.streamMany(
        token,
        buildBody(streamId),
        (event) => handleStreamEvent(execution, event),
        async (request) => {
          const result = await toolHandler(request);
          if (!isCurrentExecution(execution)) return result;
          setMessages((previous) =>
            updateTool(previous, messageId, request.callId, (tool) => ({
              ...tool,
              status: result.success === false ? 'error' : 'success',
              result,
              error:
                result.success === false && typeof result.error === 'string'
                  ? result.error
                  : undefined,
            })),
          );
          return result;
        },
      );
      if (!result.success && isCurrentExecution(execution)) {
        setError(result.error);
      }
    } finally {
      const isCurrent = isCurrentExecution(execution);
      finishTransport(execution);
      if (isCurrent) refreshSessions().catch(() => undefined);
    }
  };

  const resumeApproval = async (decision: api.ApprovalDecision) => {
    if (!pendingApproval || phase !== 'awaiting_approval') return;
    const approval = pendingApproval;
    const execution: RunExecution = {
      streamId: approval.streamId,
      messageId: approval.messageId,
      generation: generationRef.current + 1,
    };
    generationRef.current = execution.generation;
    activeExecutionRef.current = execution;
    setApprovalEditOpen(false);
    setPhase('resuming');
    setError('');
    updateExecutionMessage(execution, (message) => ({
      ...message,
      isStreaming: true,
    }));
    const toolHandler = createBrowserToolHandler(execution);
    try {
      const result = await api.resumeMany(
        token,
        execution.streamId,
        decision,
        (event) => handleStreamEvent(execution, event),
        async (request) => {
          const result = await toolHandler(request);
          if (!isCurrentExecution(execution)) return result;
          setMessages((previous) =>
            updateTool(
              previous,
              execution.messageId,
              request.callId,
              (tool) => ({
                ...tool,
                status: result.success === false ? 'error' : 'success',
                result,
              }),
            ),
          );
          return result;
        },
      );
      if (!result.success && isCurrentExecution(execution)) {
        execution.awaitingApproval = true;
        setPendingApproval(approval);
        setError(result.error);
      } else if (
        result.success &&
        isCurrentExecution(execution) &&
        !execution.awaitingApproval
      ) {
        setPendingApproval(null);
      }
    } catch (resumeError) {
      if (isCurrentExecution(execution)) {
        execution.awaitingApproval = true;
        setPendingApproval(approval);
        setError(
          resumeError instanceof Error ? resumeError.message : errorLabel,
        );
      }
    } finally {
      const isCurrent = isCurrentExecution(execution);
      finishTransport(execution);
      if (isCurrent) refreshSessions().catch(() => undefined);
    }
  };

  const stop = useCallback(() => {
    const execution = activeExecutionRef.current;
    const streamId = execution?.streamId ?? pendingApproval?.streamId;
    generationRef.current += 1;
    activeExecutionRef.current = null;
    abortController.current?.abort();
    reviewRef.current?.(false);
    setReview(null);
    setPhase('idle');
    setPendingApproval(null);
    setApprovalEditOpen(false);
    if (execution) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === execution.messageId
            ? { ...message, isStreaming: false }
            : message,
        ),
      );
    }
    if (streamId) api.cancelMany(token, streamId).catch(() => undefined);
  }, [pendingApproval?.streamId, setMessages, token]);

  const cancelOnUnmount = useCallback(() => {
    generationRef.current += 1;
    const execution = activeExecutionRef.current;
    activeExecutionRef.current = null;
    abortController.current?.abort();
    reviewRef.current?.(false);
    if (execution) {
      api.cancelMany(token, execution.streamId).catch(() => undefined);
    }
  }, [token]);

  return {
    approvalEditArgs,
    approvalEditOpen,
    interactionLocked,
    pendingApproval,
    phase,
    review,
    running,
    cancelOnUnmount,
    resumeApproval,
    run,
    setApprovalEditArgs,
    setApprovalEditOpen,
    stop,
  };
}
