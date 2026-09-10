import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../../app/components/ui/badge';
import { Button } from '../../../../app/components/ui/button';
import { Textarea } from '../../../../app/components/ui/textarea';
import ContextUsageIndicator from '../../../../app/components/many/ContextUsageIndicator';
import ManyAvatar from '../../../../app/components/many/ManyAvatar';
import ManyHitlInlineCard from '../../../../app/components/many/ManyHitlInlineCard';
import ManyComposerSurface, {
  type ManyComposerImage,
} from '../../../../app/components/many/composer/ManyComposerSurface';
import ManyConversationSurface, {
  type ManyConversationSurfaceMessage,
} from '../../../../app/components/many/conversation/ManyConversationSurface';
import ManyContextSurface from '../../../../app/components/many/panel/ManyContextSurface';
import ManyHistorySurface from '../../../../app/components/many/panel/ManyHistorySurface';
import manyMark from '../../../../public/many.png?inline';
import * as api from '../lib/client';
import { Icon } from './Icon';
import DeleteConversationDialog from './many/DeleteConversationDialog';
import ManyAssistantControls from './many/ManyAssistantControls';
import {
  assistantMarkdown,
  fileToComposerImage,
  formatUsage,
  MANY_PREFERENCE_KEYS,
  preferredThinkingLevel,
  readableLabel,
  readableToolLabel,
  readableToolResult,
} from './many/manyAssistantUtils';
import type {
  CompactionState,
  ManyAssistantHandle,
  ManyAssistantProps,
} from './many/types';
import { useManyTransport } from './many/useManyTransport';

export type {
  ManyAssistantHandle,
  ManyAssistantHeaderState,
  Task,
} from './many/types';

const ManyAssistant = forwardRef<ManyAssistantHandle, ManyAssistantProps>(function ManyAssistant(
  {
    view,
    task,
    projectId,
    tabId,
    token,
    getContext,
    page,
    browserTools,
    disabled,
    onOpenChat,
    onHeaderStateChange,
    onApply,
  },
  ref,
) {
  const { t, i18n } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ManyConversationSurfaceMessage[]>([]);
  const [threadId, setThreadId] = useState(
    () => `browser-extension:${crypto.randomUUID()}`,
  );
  const [sessionTitle, setSessionTitle] = useState<string>();
  const [sessions, setSessions] = useState<api.ManySessionSummary[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [bootstrap, setBootstrap] = useState<api.ManyBootstrap>();
  const [models, setModels] = useState<api.ModelsCatalog>();
  const [selectedModelId, setSelectedModelId] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState<api.ThinkingLevel>('off');
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [pins, setPins] = useState<api.PinnedResource[]>([]);
  const [images, setImages] = useState<ManyComposerImage[]>([]);
  const [resourceQuery, setResourceQuery] = useState('');
  const [resourceResults, setResourceResults] = useState<api.ResourceSearchItem[]>([]);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [resourceToolsEnabled, setResourceToolsEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [usage, setUsage] = useState<api.TokenUsage | null>(null);
  const [budget, setBudget] = useState<api.BudgetBreakdown | null>(null);
  const [compaction, setCompaction] = useState<CompactionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [appliedMessageId, setAppliedMessageId] = useState<string | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);

  const refreshSessions = useCallback(async () => {
    const result = await api.listManySessions(token);
    if (result.success) setSessions(result.data.sessions);
    else setError(t('sessionsUnavailable'));
  }, [t, token]);

  const {
    approvalEditArgs,
    approvalEditOpen,
    cancelOnUnmount,
    interactionLocked,
    pendingApproval,
    phase,
    review,
    running,
    resumeApproval,
    run: runTransport,
    setApprovalEditArgs,
    setApprovalEditOpen,
    stop,
  } = useManyTransport({
    token,
    projectId,
    tabId,
    setMessages,
    setError,
    setUsage,
    setBudget,
    setCompaction,
    refreshSessions,
    errorLabel: t('error'),
  });

  const clearChat = useCallback(() => {
    if (interactionLocked) return;
    setMessages([]);
    setPrompt('');
    setUsage(null);
    setBudget(null);
    setCompaction(null);
    setApprovalEditOpen(false);
    setAppliedMessageId(null);
  }, [interactionLocked, setApprovalEditOpen]);

  const startNewChat = useCallback(() => {
    if (interactionLocked) return;
    clearChat();
    setThreadId(`browser-extension:${crypto.randomUUID()}`);
    setSessionTitle(undefined);
    browser.storage.local.remove('dome.manyThread').catch(() => undefined);
    onOpenChat();
  }, [clearChat, interactionLocked, onOpenChat]);

  useImperativeHandle(ref, () => ({ startNewChat, clearChat }), [
    clearChat,
    startNewChat,
  ]);

  useEffect(() => {
    onHeaderStateChange({
      status: running ? 'thinking' : 'idle',
      sessionTitle,
      canClear: messages.length > 0,
      interactionLocked,
    });
  }, [
    interactionLocked,
    messages.length,
    onHeaderStateChange,
    running,
    sessionTitle,
  ]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getBootstrap(token),
      browser.storage.local.get(Object.values(MANY_PREFERENCE_KEYS)),
    ])
      .then(async ([result, stored]) => {
        if (cancelled) return;
        if (!result.success) {
          setError(result.error);
          return;
        }
        const bootstrapData = result.data;
        setBootstrap(bootstrapData);
        const modelResult = await api.getModelsCatalog(token);
        if (cancelled) return;
        const modelCatalog = modelResult.success ? modelResult.data : undefined;
        if (modelCatalog) setModels(modelCatalog);
        const configuredModel = bootstrapData.config.model ?? '';
        const storedModel = stored[MANY_PREFERENCE_KEYS.model];
        const storedTools = stored[MANY_PREFERENCE_KEYS.tools];
        const storedResources = stored[MANY_PREFERENCE_KEYS.resources];
        const storedMemory = stored[MANY_PREFERENCE_KEYS.memory];
        const availableIds = new Set(
          modelCatalog?.models.map((model) => model.id) ?? [],
        );
        const catalogDefault =
          modelCatalog?.models.find((model) => model.current)?.id ??
          modelCatalog?.models.find((model) => model.recommended)?.id ??
          modelCatalog?.models[0]?.id ??
          '';
        setSelectedModelId(
          typeof storedModel === 'string' && availableIds.has(storedModel)
            ? storedModel
            : configuredModel || catalogDefault,
        );
        setThinkingLevel(
          preferredThinkingLevel(
            bootstrapData.config.capabilities.thinkingLevels,
            stored[MANY_PREFERENCE_KEYS.thinking],
          ),
        );
        setToolsEnabled(
          typeof storedTools === 'boolean' ? storedTools : true,
        );
        setResourceToolsEnabled(
          typeof storedResources === 'boolean' ? storedResources : true,
        );
        setMemoryEnabled(
          typeof storedMemory === 'boolean' ? storedMemory : true,
        );
        setPreferencesReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(t('offline'));
      });
    return () => {
      cancelled = true;
    };
  }, [t, token]);

  useEffect(() => {
    if (!preferencesReady) return;
    browser.storage.local
      .set({
        [MANY_PREFERENCE_KEYS.model]: selectedModelId,
        [MANY_PREFERENCE_KEYS.thinking]: thinkingLevel,
        [MANY_PREFERENCE_KEYS.tools]: toolsEnabled,
        [MANY_PREFERENCE_KEYS.resources]: resourceToolsEnabled,
        [MANY_PREFERENCE_KEYS.memory]: memoryEnabled,
      })
      .catch(() => undefined);
  }, [
    memoryEnabled,
    preferencesReady,
    resourceToolsEnabled,
    selectedModelId,
    thinkingLevel,
    toolsEnabled,
  ]);

  const openSession = useCallback(
    async (id: string, navigate = true) => {
      setLoading(true);
      setError('');
      try {
        const result = await api.readManySession(token, id);
        if (!result.success) {
          setError(t('sessionsUnavailable'));
          return;
        }
        setThreadId(id);
        setSessionTitle(readableLabel(result.data.title, t('newSession')));
        setMessages(
          result.data.messages.map((message, index) => ({
            id: `${id}:${index}`,
            role: message.role,
            text:
              message.role === 'toolResult'
                ? readableToolResult(message.text)
                : message.text,
            timestamp: message.timestamp,
            reasoning: message.reasoning,
            images: message.attachments?.images.map((image, imageIndex) => ({
              id: `${id}:${index}:image:${imageIndex}`,
              name: readableLabel(image.name, t('attachedImage')),
              dataUrl: image.dataUrl,
            })),
            tools: message.toolCalls?.map((tool, toolIndex) => ({
              id: tool.id || `${id}:tool:${index}:${toolIndex}`,
              name: readableToolLabel(tool.name, t('toolActivity')),
              arguments: tool.arguments,
              status:
                tool.status ??
                (tool.error ? 'error' : 'success'),
              result: tool.result,
              error: tool.error,
            })),
            toolLabel:
              message.role === 'toolResult'
                ? readableToolLabel(message.toolName, t('toolActivity'))
                : undefined,
            usageLabel: formatUsage(message.usage ?? null),
          })),
        );
        await browser.storage.local.set({ 'dome.manyThread': id });
        if (navigate) onOpenChat();
      } finally {
        setLoading(false);
      }
    },
    [onOpenChat, t, token],
  );

  useEffect(() => {
    browser.storage.local
      .get('dome.manyThread')
      .then((stored) => {
        const saved = stored['dome.manyThread'];
        if (typeof saved === 'string') {
          openSession(saved, false).catch(() => setError(t('sessionsUnavailable')));
        }
      })
      .catch(() => setError(t('sessionsUnavailable')));
  }, [openSession, t]);

  useEffect(() => {
    if (view !== 'history') return;
    refreshSessions().catch(() => setError(t('sessionsUnavailable')));
  }, [refreshSessions, t, view]);

  useEffect(() => {
    if (resourceQuery.trim().length < 2) {
      setResourceResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .searchResources(token, {
          query: resourceQuery.trim(),
          projectId,
          limit: 10,
        })
        .then((result) => {
          if (cancelled || !result.success) return;
          setResourceResults(
            result.data.results ?? result.data.items ?? result.data.resources ?? [],
          );
        })
        .catch(() => undefined);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, resourceQuery, token]);

  useEffect(
    () => cancelOnUnmount,
    [cancelOnUnmount],
  );

  const run = async (instruction: string) => {
    if (interactionLocked) return;
    const context = getContext();
    if (!context.trim() && images.length === 0) {
      setError(t('emptyContext'));
      return;
    }
    const displayPrompt = instruction.trim() || t('imagePromptFallback');
    const messageImages = images.map((image) => ({ ...image }));
    setPrompt('');
    setAppliedMessageId(null);
    const bodyImages = messageImages.map((image) => ({
      dataUrl: image.dataUrl,
      name: image.name,
    }));
    setImages([]);
    await runTransport({
      displayPrompt,
      images: messageImages,
      buildBody: (streamId) => ({
          action: 'ask',
          browserTools: toolsEnabled,
          threadId,
          text: context.slice(0, 24000),
          url: page.url || undefined,
          title: page.title.slice(0, 300),
          streamId,
          model: selectedModelId || undefined,
          toolsEnabled,
          resourceToolsEnabled,
          memoryEnabled,
          projectId: projectId || undefined,
          thinkingLevel,
          mcpServerIds: toolsEnabled ? mcpServerIds : [],
          pinnedResources: resourceToolsEnabled ? pins : [],
          attachments: bodyImages.length > 0 ? { images: bodyImages } : undefined,
          prompt: `${displayPrompt}\nRespond in ${i18n.language}. Task: ${task}.`,
      }),
      onStarted: () =>
        browser.storage.local.set({ 'dome.manyThread': threadId }),
    });
  };

  const addFiles = async (files: File[]) => {
    const capabilities = bootstrap?.capabilities.attachments;
    const available = Math.max(0, (capabilities?.maxCount ?? 2) - images.length);
    try {
      const next = await Promise.all(files.slice(0, available).map(fileToComposerImage));
      const maxChars = capabilities?.maxDataUrlChars ?? 400_000;
      const valid = next.filter((image) => image.dataUrl.length <= maxChars);
      if (valid.length !== next.length || files.length > available) {
        setError(t('imageLimits'));
      }
      setImages((previous) => [
        ...previous,
        ...valid.map((image) => ({
          ...image,
          name: readableLabel(image.name, t('attachedImage')),
        })),
      ]);
    } catch {
      setError(t('imageInvalid'));
    }
  };

  const suggestions =
    task === 'contact'
      ? ['profileSummary', 'conversation']
      : task === 'note'
        ? ['improveNote', 'keyIdeas']
        : task === 'capture'
          ? ['summarize', 'keyIdeas']
          : ['summarize', 'agentCapture', 'agentNote', 'agentContact'];

  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.text.trim());

  const usageNode =
    budget && usage ? (
      <ContextUsageIndicator
        breakdown={budget}
        liveUsage={usage}
        budgetCapApprox={bootstrap?.config.contextWindow ?? undefined}
      />
    ) : usage ? (
      <Badge variant="outline" className="font-normal tabular-nums">
        {formatUsage(usage)}
      </Badge>
    ) : null;

  const skillItems =
    bootstrap?.catalogs.skills.map((skill) => ({
      id: skill.name,
      label: skill.name,
      description: skill.description,
    })) ?? [];
  const mcpItems =
    bootstrap?.catalogs.mcp.servers
      .filter((server) => server.enabled)
      .map((server) => ({
        id: server.selectionId,
        label: server.name,
        description: server.tools.slice(0, 4).join(', '),
      })) ?? [];
  const resourceItems = resourceResults.map((resource) => ({
    id: resource.id,
    label: readableLabel(resource.title ?? resource.name, t('untitledResource')),
    description: resource.snippet ?? resource.type ?? resource.kind,
  }));
  const selectedModel = models?.models.find(
    (model) => model.id === selectedModelId,
  );
  const selectedModelLabel = readableLabel(
    selectedModel?.name ?? bootstrap?.config.model ?? undefined,
    t('modelUnavailable'),
  );

  const controls = (
    <ManyAssistantControls
      skills={skillItems}
      mcpServers={mcpItems}
      resources={resourceItems}
      selectedMcpIds={mcpServerIds}
      resourceQuery={resourceQuery}
      toolsEnabled={toolsEnabled}
      resourceToolsEnabled={resourceToolsEnabled}
      memoryEnabled={memoryEnabled}
      interactionLocked={interactionLocked}
      models={models?.models ?? []}
      selectedModelId={selectedModelId}
      selectedModelLabel={selectedModelLabel}
      providerLabel={bootstrap?.config.provider ?? ''}
      thinkingLevel={thinkingLevel}
      thinkingLevels={
        bootstrap?.config.capabilities.thinkingLevels ?? ['off']
      }
      onInsertSkill={(label) =>
        setPrompt((previous) => `${previous}/${label} `)
      }
      onToggleMcp={(item) => {
        setMcpServerIds((previous) =>
          previous.includes(item.id)
            ? previous.filter((id) => id !== item.id)
            : [...previous, item.id],
        );
        setPrompt(
          (previous) =>
            `${previous}#${item.label.replaceAll(' ', '-')} `,
        );
      }}
      onResourceQueryChange={setResourceQuery}
      onPinResource={(item) => {
        setPins((previous) =>
          previous.some((pin) => pin.id === item.id)
            ? previous
            : [...previous, { id: item.id, title: item.label }],
        );
        setPrompt((previous) => `${previous}@${item.label} `);
      }}
      onToolsEnabledChange={setToolsEnabled}
      onResourceToolsEnabledChange={setResourceToolsEnabled}
      onMemoryEnabledChange={setMemoryEnabled}
      onModelChange={(value) => {
        if (value) setSelectedModelId(value);
      }}
      onThinkingLevelChange={setThinkingLevel}
    />
  );

  const pinSession = async (id: string, pinned: boolean) => {
    const result = await api.pinManySession(token, id, pinned);
    if (!result.success) {
      setError(result.error || t('error'));
      return;
    }
    await refreshSessions();
  };

  const deleteSession = async () => {
    if (!sessionToDelete || deletingSession) return;
    const id = sessionToDelete;
    setDeletingSession(true);
    try {
      const result = await api.deleteManySession(token, id);
      if (!result.success) {
        setError(result.error || t('error'));
        return;
      }
      setSessionToDelete(null);
      if (id === threadId) startNewChat();
      await refreshSessions();
    } finally {
      setDeletingSession(false);
    }
  };

  if (view === 'history') {
    const historyLabels = {
      search: t('searchChats'),
      newChat: t('newSession'),
      emptyTitle: t('historyEmpty'),
      emptyDescription: t('agentWelcomeHint'),
      pinned: t('historyPinned'),
      today: t('historyToday'),
      yesterday: t('historyYesterday'),
      thisWeek: t('historyWeek'),
      older: t('historyOlder'),
      pin: t('pinChat'),
      unpin: t('unpinChat'),
      delete: t('deleteChat'),
    };
    return (
      <>
        <ManyHistorySurface
          sessions={sessions.map((session) => ({
            ...session,
            title: readableLabel(session.title, t('newSession')),
          }))}
          currentSessionId={threadId}
          query={historyQuery}
          onQueryChange={setHistoryQuery}
          onSelectSession={(id) => {
            openSession(id).catch(() => setError(t('sessionsUnavailable')));
          }}
          onNewChat={startNewChat}
          onPinSession={(id, pinned) => {
            pinSession(id, pinned).catch(() => setError(t('error')));
          }}
          onDeleteSession={setSessionToDelete}
          labels={historyLabels}
          manyImageSrc={manyMark}
          disabled={interactionLocked || loading}
          className="many-history"
        />
        {error ? (
          <p className="status error mx-3" role="alert">
            {error}
          </p>
        ) : null}
        <DeleteConversationDialog
          open={sessionToDelete !== null}
          title={t('deleteChatTitle')}
          description={t('deleteChatDescription')}
          cancelLabel={t('cancelDelete')}
          confirmLabel={t('deleteChat')}
          busy={deletingSession}
          onOpenChange={(open) => {
            if (!open && !deletingSession) setSessionToDelete(null);
          }}
          onConfirm={() => {
            deleteSession().catch(() => setError(t('error')));
          }}
        />
      </>
    );
  }

  if (view === 'context') {
    return (
      <ManyContextSurface
        pageTitle={page.title}
        pageDescription={
          page.selection || page.readableText.slice(0, 260) || t('unsupportedPage')
        }
        pageUrl={page.url}
        pins={pins}
        capabilities={[
          {
            id: 'context-web',
            label: t('webTools'),
            checked: toolsEnabled,
            onCheckedChange: setToolsEnabled,
            disabled: interactionLocked,
          },
          {
            id: 'context-resources',
            label: t('resourceTools'),
            checked: resourceToolsEnabled,
            onCheckedChange: setResourceToolsEnabled,
            disabled: interactionLocked,
          },
          {
            id: 'context-memory',
            label: t('memory'),
            checked: memoryEnabled,
            onCheckedChange: setMemoryEnabled,
            disabled: interactionLocked,
          },
        ]}
        modelLabel={selectedModelLabel}
        providerLabel={bootstrap?.config.provider ?? t('providerUnavailable')}
        contextTitle={t('context')}
        contextEmpty={t('emptyContext')}
        capabilitiesTitle={t('capabilities')}
        configurationTitle={t('configuration')}
        noPinsLabel={t('noPins')}
        usage={usageNode}
        pageTools={browserTools}
        className="many-context"
      />
    );
  }

  const approvalAction = pendingApproval?.actionRequests[0];
  const approvalAllowsEdit = Boolean(
    approvalAction &&
      pendingApproval?.reviewConfigs
        .find((config) => config.actionName === approvalAction.name)
        ?.allowedDecisions.includes('edit'),
  );
  const approvalNode =
    pendingApproval && approvalAction ? (
      <div
        className={
          phase === 'resuming'
            ? 'pointer-events-none flex flex-col gap-2 opacity-70'
            : 'flex flex-col gap-2'
        }
        aria-busy={phase === 'resuming'}
      >
        <ManyHitlInlineCard
          action={approvalAction.name.replaceAll('_', ' ')}
          target={approvalAction.description || t('approvalRequired')}
          previewCommand={JSON.stringify(approvalAction.args, null, 2)}
          showApproveAll
          showReject
          showEditArgs={approvalAllowsEdit}
          onEditArgs={() => setApprovalEditOpen((open) => !open)}
          labels={{
            title: t('hitlTitle'),
            approve: t('approve'),
            approveAll: t('approveAll'),
            reject: t('rejectAction'),
            edit: t('editAction'),
            expires: (seconds) => t('hitlExpires', { seconds }),
            paused: t('hitlPaused'),
          }}
          onApprove={() => {
            resumeApproval({ type: 'approve' }).catch(() => setError(t('error')));
          }}
          onApproveAll={() => {
            resumeApproval({ type: 'approve_all' }).catch(() => setError(t('error')));
          }}
          onReject={() => {
            resumeApproval({ type: 'reject' }).catch(() => setError(t('error')));
          }}
        />
        {approvalEditOpen ? (
          <div className="rounded-xl border bg-card p-3">
            <Textarea
              value={approvalEditArgs}
              onChange={(event) => setApprovalEditArgs(event.target.value)}
              aria-label={t('editArguments')}
              className="min-h-28 font-mono text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={() => {
                try {
                  const parsed = JSON.parse(approvalEditArgs) as unknown;
                  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('Invalid arguments');
                  }
                  resumeApproval({
                    type: 'edit',
                    editedAction: {
                      name: approvalAction.name,
                      args: parsed as Record<string, unknown>,
                    },
                  }).catch(() => setError(t('error')));
                } catch {
                  setError(t('invalidArguments'));
                }
              }}
            >
              {t('runEditedAction')}
            </Button>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <aside className="many-assistant" aria-label={`Many · ${t(task)}`}>
      <ManyConversationSurface
        threadId={threadId}
        messages={messages}
        ariaLabel={t('chat')}
        manyImageSrc={manyMark}
        loadingLabel={
          running && !pendingApproval && !messages.at(-1)?.text
            ? t('working')
            : undefined
        }
        reasoningLabel={t('reasoning')}
        toolsLabel={t('toolDetails')}
        imageLabel={t('attachedImage')}
        renderAssistant={assistantMarkdown}
        notices={
          compaction ? (
            <div className="mx-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{t('contextCompacted')}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setCompaction(null)}
                >
                  {t('dismiss')}
                </Button>
              </div>
              <p className="mt-1 text-muted-foreground">
                {t('compactionDetail', {
                  before: compaction.tokensBefore,
                  after: compaction.tokensAfter ?? '—',
                })}
              </p>
              {compaction.summaryPreview ? (
                <p className="mt-1 line-clamp-2 text-muted-foreground">
                  {compaction.summaryPreview}
                </p>
              ) : null}
            </div>
          ) : null
        }
        approval={approvalNode}
        emptyState={
          <div className="many-welcome">
            <ManyAvatar size="lg" state="idle" imageSrc={manyMark} />
            <h1>{t('agentWelcome')}</h1>
            <p>{t('agentWelcomeHint')}</p>
          </div>
        }
      />

      {lastAssistant && onApply ? (
        <Button
          variant="outline"
          className="mx-3"
          disabled={
            interactionLocked ||
            disabled ||
            appliedMessageId === lastAssistant.id
          }
          onClick={() => {
            if (onApply(lastAssistant.text.trim())) {
              setAppliedMessageId(lastAssistant.id);
            }
          }}
        >
          <Icon
            name={appliedMessageId === lastAssistant.id ? 'check' : 'plus'}
          />
          {appliedMessageId === lastAssistant.id
            ? t('applied')
            : t(task === 'contact' ? 'useContact' : 'insert')}
        </Button>
      ) : null}

      {messages.length === 0 ? (
        <div className="many-suggestions">
          {suggestions.map((label) => (
            <Button
              variant="outline"
              size="sm"
              type="button"
              key={label}
              disabled={interactionLocked || disabled || loading}
              onClick={() => {
                run(t(label)).catch(() => setError(t('error')));
              }}
            >
              {t(label)}
            </Button>
          ))}
        </div>
      ) : null}

      {review ? (
        <div className="agent-review" role="alertdialog" aria-label={t('reviewAction')}>
          <strong>{t(`tool_${review.name}`)}</strong>
          <p>{review.detail}</p>
          <div className="dome-row">
            <Button
              onClick={() => {
                const approval = review.origin
                  ? browser.permissions.request({
                      origins: [`${review.origin}/*`],
                    })
                  : Promise.resolve(true);
                approval
                  .then((approved) => review.resolve(approved))
                  .catch(() => review.resolve(false));
              }}
            >
              {t(review.origin ? 'allowPage' : 'confirmAction')}
            </Button>
            <Button variant="outline" onClick={() => review.resolve(false)}>
              {t('rejectAction')}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="status error mx-3" role="alert">
          {error}
        </p>
      ) : null}

      <ManyComposerSurface
        value={prompt}
        onValueChange={setPrompt}
        onSend={() => {
          run(prompt).catch(() => setError(t('error')));
        }}
        onStop={stop}
        onFiles={(files) => {
          addFiles(files).catch(() => setError(t('imageInvalid')));
        }}
        onRemoveImage={(id) =>
          setImages((previous) => previous.filter((image) => image.id !== id))
        }
        onRemovePin={(id) =>
          setPins((previous) => previous.filter((pin) => pin.id !== id))
        }
        images={images}
        pins={pins}
        placeholder={t('askPlaceholder')}
        sendLabel={t('ask')}
        stopLabel={t('cancel')}
        attachLabel={t('attachImages')}
        removeLabel={t('remove')}
        isLoading={running}
        disabled={disabled || loading || interactionLocked}
        maxLength={3800}
        controls={controls}
        usage={usageNode}
      />
    </aside>
  );
});

export default ManyAssistant;
