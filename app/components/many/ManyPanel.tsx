import { useState, useRef, useCallback, useMemo, startTransition } from 'react';
import ContextUsageIndicator from './ContextUsageIndicator';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useLocation, useSearchParams } from 'react-router-dom';
import ManyChatHeader from './ManyChatHeader';
import ManyChatHistoryPanel from './ManyChatHistoryPanel';
import ChatHistoryPanel from '@/components/chat/ChatHistoryPanel';
import ManyComposer from '@/components/many/chat/ManyComposer';
import { ManyPanelChrome, ManyTranscript, ManyWelcomeScreen } from '@/components/many/chat/ManyPanelView';
import { useManyStore } from '@/lib/store/useManyStore';
import { useManyConversationSettings } from './useManyConversationSettings';
import { sanitizeManySessionTitle } from '@/lib/store/manySessionStorage';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { estimateClientBudgetFromChat } from '@/lib/chat/contextUsage';
import { createManyToolsForContext } from '@/lib/ai';
import { createRememberFactTool } from '@/lib/ai/tools/memory';
import { showToast } from '@/lib/store/useToastStore';
import type { ManyMessageThreadHandle } from '@/components/many/chat/ManyMessageThread';
import { manyContextSlotPlacement } from '@/lib/many/contextSlotPlacement';
import { useManySessionSync } from '@/lib/many/useManySessionSync';
import { useManyRunLifecycle } from '@/lib/many/useManyRunLifecycle';
import { useManySend } from '@/lib/many/useManySend';
import UICursorOverlay from './UICursorOverlay';
import { cn } from '@/lib/utils';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ResourceIcon from '@/components/shared/ResourceIcon';

interface ManyPanelProps {
  width: number;
  onClose: () => void;
  isVisible: boolean;
  isFullscreen?: boolean;
  /** Standalone Electron popout at /standalone/many */
  isPopout?: boolean;
  /** Motor de mensajes sin UI (voz global con panel lateral cerrado / pestaña Chat). */
  mode?: 'full' | 'headless';
}

export default function ManyPanel({
  width,
  onClose,
  isVisible,
  isFullscreen = false,
  isPopout = false,
  mode = 'full',
}: ManyPanelProps) {
  const isHeadless = mode === 'headless';
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  const {
    status,
    setStatus,
    messages,
    addMessage,
    clearMessages,
    startNewChat,
    switchSession: _switchSession,
    deleteSession: _deleteSession,
    sessions,
    currentSessionId,
    currentResourceId,
    currentResourceTitle,
    petPromptOverride,
    pinnedResources,
  } = useManyStore(
    useShallow((s) => ({
      status: s.status,
      setStatus: s.setStatus,
      messages: s.messages,
      addMessage: s.addMessage,
      clearMessages: s.clearMessages,
      startNewChat: s.startNewChat,
      switchSession: s.switchSession,
      deleteSession: s.deleteSession,
      sessions: s.sessions,
      currentSessionId: s.currentSessionId,
      currentResourceId: s.currentResourceId,
      currentResourceTitle: s.currentResourceTitle,
      petPromptOverride: s.petPromptOverride,
      pinnedResources: s.pinnedResources,
    })),
  );

  const pendingPdfRegion = useManyStore((s) => s.pendingPdfRegion);
  const clearPendingPdfRegion = useManyStore((s) => s.clearPendingPdfRegion);
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const activeShellTab = useTabStore((s) => s.tabs.find((tab) => tab.id === s.activeTabId));
  const activeShellTabType = activeShellTab?.type;
  const chatProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const pendingManyHandoff = useManyStore((s) => s.pendingManyHandoff);
  const setPendingManyHandoff = useManyStore((s) => s.setPendingManyHandoff);
  const setSessionRunState = useManyStore((s) => s.setSessionRunState);
  const currentSessionRunPhase = useManyStore((s) =>
    currentSessionId ? s.activeRunBySessionId[currentSessionId] : undefined,
  );

  const [input, setInput] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const {
    toolsEnabled,
    setToolsEnabled,
    resourceToolsEnabled,
    setResourceToolsEnabled,
    memoryEnabled,
    setMemoryEnabled,
    mcpEnabled,
    supportsTools,
    soulContent,
    userMemory,
    providerInfo,
    providerId,
    budgetCapApprox,
  } = useManyConversationSettings();

  const abortControllerRef = useRef<AbortController | null>(null);
  const messageThreadRef = useRef<ManyMessageThreadHandle>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const scrollToBottomRef = useRef<(force?: boolean) => void>(() => {});

  const effectiveResourceId =
    currentResourceId ||
    activeShellTab?.resourceId ||
    (pathname?.startsWith('/workspace') ? searchParams.get('id') : null);
  const effectiveResourceTitle = currentResourceTitle || activeShellTab?.title || null;

  const { currentSession, currentSessionIdRef, refreshSessionFromThreadRef } = useManySessionSync({
    chatProjectId,
    showHistory,
  });

  const activeTools = useMemo(() => {
    const tools = createManyToolsForContext(pathname || '/', {
      includeWeb: toolsEnabled,
      includeResources: resourceToolsEnabled,
    });
    if (memoryEnabled) {
      tools.push(createRememberFactTool());
    }
    return tools;
  }, [toolsEnabled, resourceToolsEnabled, memoryEnabled, pathname]);

  const clientBudgetEstimate = useMemo(() => {
    if (messages.length === 0 && !isLoading) return null;
    return estimateClientBudgetFromChat({
      messages,
      toolCount: activeTools.length,
      userMemoryChars: userMemory.length,
      mcpToolCount: toolsEnabled && mcpEnabled ? 8 : 0,
    });
  }, [messages, isLoading, activeTools.length, userMemory.length, toolsEnabled, mcpEnabled]);

  const {
    streamingMessage,
    setStreamingMessage,
    pdfRegionStreamingMessage,
    setPdfRegionStreamingMessage,
    pendingApproval,
    setPendingApproval,
    compactionNotice,
    setCompactionNotice,
    error,
    setError,
    setLiveUsage,
    applyRunSnapshot,
    chatMessages,
    messageGroups,
    lastUserGroupIndex,
    displayBudget,
    sessionLiveUsage,
    loadingHint,
    showContextUsage,
    showHitlInline,
    activeRunSessionIdRef,
    voiceAutoSpeakForRunIdRef,
  } = useManyRunLifecycle({
    currentSessionId,
    currentSessionIdRef,
    refreshSessionFromThreadRef,
    scrollToBottomRef,
    messages,
    isLoading,
    setIsLoading,
    setStatus,
    addMessage,
    activeRunId,
    setActiveRunId,
    isSubmittingRef,
    currentSessionRunPhase,
    clientBudgetEstimate,
  });

  const scrollToBottom = useCallback((_force?: boolean) => {
    messageThreadRef.current?.scrollToEnd('auto');
  }, []);

  const resetScrollLock = useCallback(() => {
    messageThreadRef.current?.resetScrollLock();
  }, []);

  scrollToBottomRef.current = scrollToBottom;

  const { handleSend, handleAbort, handleRegenerate } = useManySend({
    input,
    setInput,
    chatAttachments,
    setChatAttachments,
    isLoading,
    setIsLoading,
    messages,
    addMessage,
    setStatus,
    setError,
    setPendingApproval,
    currentSessionId,
    currentSession,
    pinnedResources,
    petPromptOverride,
    pathname,
    homeSidebarSection,
    activeShellTabType,
    currentFolderId,
    chatProjectId,
    effectiveResourceId,
    effectiveResourceTitle,
    activeShellTab,
    toolsEnabled,
    resourceToolsEnabled,
    memoryEnabled,
    mcpEnabled,
    supportsTools,
    soulContent,
    userMemory,
    isHeadless,
    inputRef,
    setStreamingMessage,
    setLiveUsage,
    setCompactionNotice,
    setActiveRunId,
    applyRunSnapshot,
    setPdfRegionStreamingMessage,
    pdfRegionStreamingMessage,
    activeRunSessionIdRef,
    voiceAutoSpeakForRunIdRef,
    isSubmittingRef,
    activeRunId,
    abortControllerRef,
    scrollToBottom,
    resetScrollLock,
    setSessionRunState,
    clearPendingPdfRegion,
    t,
  });

  const prevHandoffRef = useRef<string | null>(null);
  if (
    pendingManyHandoff &&
    pendingManyHandoff !== prevHandoffRef.current &&
    isVisible &&
    !isHeadless
  ) {
    const text = pendingManyHandoff;
    prevHandoffRef.current = text;
    setInput(text);
    setPendingManyHandoff(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = text.length;
      el.setSelectionRange(len, len);
    });
  } else if (!pendingManyHandoff && prevHandoffRef.current !== null) {
    prevHandoffRef.current = null;
  }

  const handleDismissManyError = useCallback(() => setError(null), [setError]);

  const handleReportManyError = useCallback(() => {
    if (!error) return;
    void navigator.clipboard
      .writeText(error)
      .then(() => {
        showToast('info', t('many.error_copied'));
      })
      .catch(() => {
        showToast('error', t('viewer.transcript_copy_failed'));
      });
  }, [error, t]);

  const handleClear = useCallback(() => {
    if (window.confirm(t('chat.clear_confirm'))) {
      clearMessages();
      showToast('info', t('chat.chat_cleared'));
    }
  }, [clearMessages, t]);

  const contextDescription = effectiveResourceTitle?.trim() ?? '';
  const contextSlot = manyContextSlotPlacement({ isFullscreen, showContextUsage });

  const composerContextUsageSlot = contextSlot.composer ? (
    <ManyComposer.ContextUsage>
      <ContextUsageIndicator
        key={currentSessionId ?? 'none'}
        breakdown={displayBudget!}
        liveUsage={sessionLiveUsage}
        budgetCapApprox={budgetCapApprox}
        variant="header"
      />
    </ManyComposer.ContextUsage>
  ) : null;

  const composerProps = {
    input,
    setInput,
    inputRef,
    isLoading: isLoading || !!pdfRegionStreamingMessage?.isStreaming,
    toolsEnabled,
    resourceToolsEnabled,
    memoryEnabled,
    setToolsEnabled,
    setResourceToolsEnabled,
    setMemoryEnabled,
    supportsTools,
    onSend: () => void handleSend(),
    onAbort: handleAbort,
    inputPlaceholderOverride: pendingPdfRegion ? t('many.input_placeholder_pdf_region') : null,
    attachments: chatAttachments,
    onAttachmentsChange: setChatAttachments,
    showComposerKeyboardHint: true as const,
    compact: !isFullscreen,
    children: composerContextUsageSlot,
  };

  const welcomeComposer = (
    <ManyComposer
      {...composerProps}
      isWelcomeScreen
      isLoading={isLoading}
      compact={false}
      showComposerKeyboardHint={false}
    />
  );

  const bottomComposer = <ManyComposer {...composerProps} />;

  const showWelcomeFullscreen =
    isFullscreen &&
    chatMessages.length === 0 &&
    !streamingMessage &&
    !pdfRegionStreamingMessage &&
    !pendingPdfRegion;

  const showBottomComposer = !showWelcomeFullscreen;

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === currentSessionId) {
        setShowHistory(false);
        return;
      }
      startTransition(() => {
        _switchSession(id);
      });
      setShowHistory(false);
    },
    [_switchSession, currentSessionId],
  );

  const prevIsFullscreenRef = useRef(isFullscreen);
  if (isFullscreen !== prevIsFullscreenRef.current) {
    prevIsFullscreenRef.current = isFullscreen;
    setShowHistory(isFullscreen);
  }

  const handleToggleHistory = useCallback(() => {
    setShowContext(false);
    setShowHistory((v) => !v);
  }, []);

  const openChatTab = useTabStore((s) => s.openChatTab);

  const handleToggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      const { tabs, activeTabId, closeTab } = useTabStore.getState();
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      if (activeTab?.type === 'chat') {
        closeTab(activeTab.id);
      }
      window.dispatchEvent(new CustomEvent('dome:many-sidebar-open'));
      return;
    }
    const sid = currentSessionId ?? useManyStore.getState().currentSessionId;
    if (!sid) {
      startNewChat();
    }
    const sessionId = useManyStore.getState().currentSessionId;
    if (!sessionId) return;
    const session = useManyStore.getState().sessions.find((s) => s.id === sessionId);
    const title = session?.title
      ? sanitizeManySessionTitle(session.title)
      : t('shell.new_chat');
    openChatTab(sessionId, title);
  }, [isFullscreen, currentSessionId, startNewChat, openChatTab, t]);

  const handlePopout = useCallback(async () => {
    if (!window.electron?.invoke) return;
    const sessionId = currentSessionId ?? useManyStore.getState().currentSessionId;
    const session = sessionId
      ? useManyStore.getState().sessions.find((s) => s.id === sessionId)
      : null;
    const title = session?.title
      ? sanitizeManySessionTitle(session.title)
      : t('many.many');
    let backgroundColor: string | undefined;
    if (typeof document !== 'undefined') {
      backgroundColor =
        getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || undefined;
    }
    const route = sessionId
      ? `/standalone/many?session=${encodeURIComponent(sessionId)}`
      : '/standalone/many';
    try {
      await window.electron.invoke('window:create', {
        id: 'many-popout',
        route,
        options: {
          width: 520,
          height: 780,
          minWidth: 380,
          minHeight: 520,
          title: `${title} — Many`,
          transparent: false,
          vibrancy: null,
          ...(backgroundColor ? { backgroundColor } : {}),
        },
      });
    } catch (err) {
      console.error('[ManyPanel] Failed to open popout:', err);
    }
  }, [currentSessionId, t]);

  if (isHeadless) {
    return null;
  }

  return (
    <>
      <UICursorOverlay />
      <div
        className={cn(
          'flex h-full shrink-0 flex-col overflow-hidden border-l',
          isPopout && 'many-panel--popout',
        )}
        style={
          isFullscreen
            ? {
                position: 'relative',
                width: '100%',
                minWidth: 0,
                maxWidth: 'none',
                ...(isPopout ? {} : { background: 'var(--background)' }),
                borderLeftWidth: 0,
                opacity: 1,
                pointerEvents: 'auto',
              }
            : {
                position: 'relative',
                width: isVisible ? `${width}px` : '0px',
                minWidth: isVisible ? 320 : 0,
                maxWidth: isVisible ? 600 : 0,
                background: 'var(--background)',
                borderColor: 'var(--border)',
                borderLeftWidth: isVisible ? undefined : '0px',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
                pointerEvents: isVisible ? 'auto' : 'none',
                transition: 'transform var(--duration-ui) var(--ease-out), opacity var(--duration-fast) var(--ease-out)',
              }
        }
      >
        <ManyChatHeader
          status={status}
          providerInfo={providerInfo}
          providerId={providerId}
          contextDescription={contextDescription}
          messagesCount={messages.length}
          loadingHint={loadingHint}
          sessionTitle={
            currentSession?.title
              ? sanitizeManySessionTitle(currentSession.title)
              : undefined
          }
          historyOpen={showHistory}
          onClear={handleClear}
          onStartNewChat={() => {
            startNewChat();
            setShowHistory(false);
          }}
          onToggleHistory={handleToggleHistory}
          onClose={onClose}
          showClose={!isFullscreen || isPopout}
          showHistoryToggle
          isPopout={isPopout}
          showFullscreenToggle={!isPopout}
          isFullscreenActive={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          showPopoutToggle={!isPopout}
          onPopout={() => void handlePopout()}
        >
          {contextSlot.header ? (
            <ManyChatHeader.ContextUsage>
              <ContextUsageIndicator
                key={currentSessionId ?? 'none'}
                breakdown={displayBudget!}
                liveUsage={sessionLiveUsage}
                budgetCapApprox={budgetCapApprox}
                variant="header"
              />
            </ManyChatHeader.ContextUsage>
          ) : null}
        </ManyChatHeader>

        {!isFullscreen ? (
          <Tabs
            value={showContext ? 'context' : showHistory ? 'history' : 'conversation'}
            onValueChange={(value) => {
              setShowContext(value === 'context');
              setShowHistory(value === 'history');
            }}
            className="shrink-0 border-b px-3 py-2"
          >
            <TabsList className="w-full">
              <TabsTrigger value="conversation" className="flex-1">{t('many.conversation', 'Conversación')}</TabsTrigger>
              <TabsTrigger value="history" className="flex-1">{t('many.history', 'Historial')}</TabsTrigger>
              <TabsTrigger value="context" className="flex-1">{t('many.context', 'Contexto')}</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

        {showHistory && !isFullscreen ? (
          <ManyChatHistoryPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={() => {
              startNewChat();
              setShowHistory(false);
            }}
            onDeleteSession={_deleteSession}
            onClose={() => setShowHistory(false)}
          />
        ) : null}

        {showContext && !isFullscreen ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <Card size="sm" className="shadow-sm">
              <CardHeader>
                <CardTitle>{t('many.context', 'Contexto')}</CardTitle>
                <CardDescription>{contextDescription || t('many.no_context', 'Sin contexto activo')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Badge variant="outline">{currentResourceTitle || activeShellTab?.title || t('workspace.home')}</Badge>
                <div className="flex flex-wrap gap-2">
                  {pinnedResources.map((resource) => (
                    <Badge key={resource.id} variant="secondary" className="max-w-full">
                      <ResourceIcon type={resource.type} name={resource.title} size={12} />
                      <span className="truncate">{resource.title}</span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            {showContextUsage && displayBudget ? (
              <ContextUsageIndicator
                key={currentSessionId ?? 'none'}
                breakdown={displayBudget}
                liveUsage={sessionLiveUsage}
                budgetCapApprox={budgetCapApprox}
                variant="inline"
              />
            ) : null}
          </div>
        ) : null}

        <div className={cn('min-h-0 min-w-0 flex-1 flex-row overflow-hidden', showContext && !isFullscreen ? 'hidden' : 'flex')}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {showWelcomeFullscreen ? (
              <ManyWelcomeScreen
                variant="fullscreen"
                isPopout={isPopout}
                supportsTools={supportsTools}
                composer={welcomeComposer}
                onPrompt={(text) => {
                  setInput(text);
                  inputRef.current?.focus();
                }}
              />
            ) : (
              <ManyTranscript
                threadRef={messageThreadRef}
                isFullscreen={isFullscreen}
                isPopout={isPopout}
                isStreaming={Boolean(streamingMessage?.isStreaming || isLoading)}
                chatMessages={chatMessages}
                messageGroups={messageGroups}
                lastUserGroupIndex={lastUserGroupIndex}
                streamingMessage={streamingMessage}
                pdfRegionStreamingMessage={pdfRegionStreamingMessage}
                isLoading={isLoading}
                showHitlInline={showHitlInline}
                pendingApproval={pendingApproval}
                onDismissApproval={() => setPendingApproval(null)}
                onRegenerate={handleRegenerate}
                error={error}
                onRetryError={handleDismissManyError}
                onReportError={handleReportManyError}
                supportsTools={supportsTools}
                onPrompt={(text) => {
                  setInput(text);
                  inputRef.current?.focus();
                }}
              />
            )}

            <ManyPanelChrome
              isVisible={isVisible}
              pendingPdfRegion={pendingPdfRegion}
              onDismissPdfRegion={() => clearPendingPdfRegion()}
              compactionNotice={compactionNotice}
              onDismissCompaction={() => setCompactionNotice(null)}
              loadingHint={loadingHint}
              showHitlInline={showHitlInline}
              isLoading={isLoading}
              showBottomComposer={showBottomComposer}
              isFullscreen={isFullscreen}
              isPopout={isPopout}
              composer={bottomComposer}
            />
          </div>

          {isFullscreen && showHistory ? (
            <ChatHistoryPanel placement="inline-right" onClose={() => setShowHistory(false)} />
          ) : null}
        </div>
      </div>
    </>
  );
}
