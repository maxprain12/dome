import { useCallback, useMemo, useRef, useState, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useLocation, useSearchParams } from 'react-router-dom';
import ManyHeader, { type ManyPanelViewId } from './panel/ManyHeader';
import ManyHistoryView from './panel/ManyHistoryView';
import ManyContextView from './panel/ManyContextView';
import ManyConversation, {
  type ManyConversationHandle,
} from './conversation/ManyConversation';
import ManyWelcome from './conversation/ManyWelcome';
import { ManyCompactionNotice, ManyLoadingMarker, ManyPdfRegionChip } from './conversation/ManyNotices';
import ManyComposer from './composer/ManyComposer';
import ContextUsageIndicator from './ContextUsageIndicator';
import UICursorOverlay from './UICursorOverlay';
import { useManyStore } from '@/lib/store/useManyStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useManyConversationSettings } from '@/lib/many/useManyConversationSettings';
import { useManySessionSync } from '@/lib/many/useManySessionSync';
import { useManyRunLifecycle } from '@/lib/many/useManyRunLifecycle';
import { useManySend } from '@/lib/many/useManySend';
import { sanitizeManySessionTitle } from '@/lib/store/manySessionStorage';
import { estimateClientBudgetFromChat } from '@/lib/chat/contextUsage';
import { createManyToolsForContext } from '@/lib/ai';
import { createRememberFactTool } from '@/lib/ai/tools/memory';
import { showToast } from '@/lib/store/useToastStore';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { cn } from '@/lib/utils';

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
    switchSession,
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
  const [view, setView] = useState<ManyPanelViewId>('chat');
  const [fullscreenHistoryOpen, setFullscreenHistoryOpen] = useState(isFullscreen);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const settings = useManyConversationSettings();
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
    budgetCapApprox,
  } = settings;

  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<ManyConversationHandle>(null);
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
    showHistory: view === 'history' || (isFullscreen && fullscreenHistoryOpen),
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
    conversationRef.current?.scrollToEnd('auto');
  }, []);

  const resetScrollLock = useCallback(() => {
    conversationRef.current?.resetScrollLock();
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

  // Consume a queued handoff (PDF region → Many) into the input field.
  const prevHandoffRef = useRef<string | null>(null);
  if (pendingManyHandoff && pendingManyHandoff !== prevHandoffRef.current && isVisible && !isHeadless) {
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

  const handleDismissError = useCallback(() => setError(null), [setError]);

  const handleReportError = useCallback(() => {
    if (!error) return;
    void navigator.clipboard
      .writeText(error)
      .then(() => {
        showToast('info', t('many.error_copied'));
      })
      .catch(() => {
        showToast('error', t('media.transcript_copy_failed'));
      });
  }, [error, t]);

  const handleClear = useCallback(() => {
    if (window.confirm(t('chat.clear_confirm'))) {
      clearMessages();
      showToast('info', t('chat.chat_cleared'));
    }
  }, [clearMessages, t]);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== currentSessionId) {
        startTransition(() => {
          switchSession(id);
        });
      }
      setView('chat');
      if (isFullscreen) setFullscreenHistoryOpen(false);
    },
    [switchSession, currentSessionId, isFullscreen],
  );

  const handleStartNewChat = useCallback(() => {
    startNewChat();
    setView('chat');
  }, [startNewChat]);

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
    const title = session?.title ? sanitizeManySessionTitle(session.title) : t('shell.new_chat');
    openChatTab(sessionId, title);
  }, [isFullscreen, currentSessionId, startNewChat, openChatTab, t]);

  const handlePopout = useCallback(async () => {
    if (!window.electron?.invoke) return;
    const sessionId = currentSessionId ?? useManyStore.getState().currentSessionId;
    const session = sessionId
      ? useManyStore.getState().sessions.find((s) => s.id === sessionId)
      : null;
    const title = session?.title ? sanitizeManySessionTitle(session.title) : t('many.many');
    let backgroundColor: string | undefined;
    if (typeof document !== 'undefined') {
      backgroundColor =
        getComputedStyle(document.documentElement).getPropertyValue('--background').trim() ||
        undefined;
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

  const contextDescription = effectiveResourceTitle?.trim() ?? '';
  const isComposerBusy = isLoading || !!pdfRegionStreamingMessage?.isStreaming;

  const contextUsageNode =
    showContextUsage && displayBudget ? (
      <ContextUsageIndicator
        key={currentSessionId ?? 'none'}
        breakdown={displayBudget}
        liveUsage={sessionLiveUsage}
        budgetCapApprox={budgetCapApprox}
      />
    ) : null;

  const composerSharedProps = {
    input,
    setInput,
    inputRef,
    toolsEnabled,
    resourceToolsEnabled,
    memoryEnabled,
    setToolsEnabled,
    setResourceToolsEnabled,
    setMemoryEnabled,
    supportsTools,
    onSend: () => void handleSend(),
    onAbort: handleAbort,
    placeholderOverride: pendingPdfRegion ? t('many.input_placeholder_pdf_region') : null,
    attachments: chatAttachments,
    onAttachmentsChange: setChatAttachments,
  };

  const isTranscriptEmpty =
    chatMessages.length === 0 && !streamingMessage && !pdfRegionStreamingMessage;

  const showWelcomeHero =
    isFullscreen && isTranscriptEmpty && !pendingPdfRegion;

  const setPromptFromSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  return (
    <>
      <UICursorOverlay />
      <div
        className={cn('flex h-full shrink-0 flex-col overflow-hidden bg-sidebar')}
        style={
          isFullscreen
            ? {
                position: 'relative',
                width: '100%',
                minWidth: 0,
                maxWidth: 'none',
                borderLeftWidth: 0,
                opacity: 1,
                pointerEvents: 'auto',
              }
            : {
                position: 'relative',
                width: isVisible ? `${width}px` : '0px',
                minWidth: isVisible ? 320 : 0,
                maxWidth: isVisible ? 600 : 0,
                borderLeftWidth: isVisible ? undefined : '0px',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
                pointerEvents: isVisible ? 'auto' : 'none',
                transition:
                  'transform var(--duration-ui) var(--ease-out), opacity var(--duration-fast) var(--ease-out)',
              }
        }
      >
        <ManyHeader
          status={status}
          sessionTitle={
            currentSession?.title ? sanitizeManySessionTitle(currentSession.title) : undefined
          }
          contextDescription={contextDescription}
          loadingHint={loadingHint}
          view={view}
          onViewChange={setView}
          showViewSwitcher={!isFullscreen}
          historyOpen={fullscreenHistoryOpen}
          onToggleHistory={() => setFullscreenHistoryOpen((v) => !v)}
          showHistoryToggle={isFullscreen}
          onStartNewChat={handleStartNewChat}
          onClear={handleClear}
          canClear={messages.length > 0}
          onClose={onClose}
          showClose={!isFullscreen}
          isPopout={isPopout}
          showFullscreenToggle={!isPopout}
          isFullscreenActive={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          showPopoutToggle={!isPopout}
          onPopout={() => void handlePopout()}
        />

        {view === 'history' && !isFullscreen ? (
          <ManyHistoryView onSelectSession={handleSelectSession} onNewChat={handleStartNewChat} />
        ) : null}

        {view === 'context' && !isFullscreen ? (
          <ManyContextView
            contextDescription={contextDescription}
            settings={settings}
            contextUsage={contextUsageNode}
          />
        ) : null}

        <div
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-row overflow-hidden',
            view !== 'chat' && !isFullscreen ? 'hidden' : 'flex',
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {showWelcomeHero ? (
              <ManyWelcome
                variant="hero"
                supportsTools={supportsTools}
                onPrompt={setPromptFromSuggestion}
                composer={
                  <ManyComposer
                    {...composerSharedProps}
                    isLoading={isLoading}
                    variant="welcome"
                    showKeyboardHint={false}
                    contextUsage={contextUsageNode}
                  />
                }
              />
            ) : (
              <ManyConversation
                ref={conversationRef}
                isFullscreen={isFullscreen}
                isStreaming={Boolean(streamingMessage?.isStreaming || isLoading)}
                isEmpty={isTranscriptEmpty}
                messageGroups={messageGroups}
                lastUserGroupIndex={lastUserGroupIndex}
                isLoading={isLoading}
                hasStreamingMessage={Boolean(streamingMessage)}
                showApprovalGate={showHitlInline}
                pendingApproval={pendingApproval}
                onDismissApproval={() => setPendingApproval(null)}
                onRegenerate={handleRegenerate}
                error={error}
                onRetryError={handleDismissError}
                onReportError={handleReportError}
                supportsTools={supportsTools}
                onPrompt={setPromptFromSuggestion}
              />
            )}

            {isVisible && pendingPdfRegion ? (
              <ManyPdfRegionChip pending={pendingPdfRegion} onDismiss={clearPendingPdfRegion} />
            ) : null}
            {compactionNotice && !showHitlInline ? (
              <ManyCompactionNotice
                event={compactionNotice}
                onDismiss={() => setCompactionNotice(null)}
              />
            ) : null}
            {isLoading && loadingHint && !showHitlInline ? (
              <div className="mx-4 mb-1" aria-live="polite">
                <ManyLoadingMarker label={loadingHint} />
              </div>
            ) : null}

            {!showWelcomeHero ? (
              isFullscreen ? (
                <div className="shrink-0 border-t bg-sidebar/80 backdrop-blur-sm">
                  <div className={cn('mx-auto w-full max-w-3xl px-4 pb-1', isPopout && 'px-3')}>
                    <ManyComposer
                      {...composerSharedProps}
                      isLoading={isComposerBusy}
                      showKeyboardHint
                      contextUsage={contextUsageNode}
                    />
                  </div>
                </div>
              ) : (
                <div className="shrink-0 border-t">
                  <ManyComposer
                    {...composerSharedProps}
                    isLoading={isComposerBusy}
                    showKeyboardHint
                    compact
                    contextUsage={contextUsageNode}
                  />
                </div>
              )
            ) : null}
          </div>

          {isFullscreen && fullscreenHistoryOpen ? (
            <aside className="flex w-72 shrink-0 flex-col border-l bg-card/40">
              <ManyHistoryView
                onSelectSession={handleSelectSession}
                onNewChat={handleStartNewChat}
              />
            </aside>
          ) : null}
        </div>
      </div>
    </>
  );
}
