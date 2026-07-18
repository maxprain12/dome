import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useManyStore, type ManyChatSession } from '@/lib/store/useManyStore';
import {
  filterOutDeletedSessions,
  deriveManySessionTitle,
  persistManySessions,
} from '@/lib/store/manySessionStorage';
import {
  fetchManyMessagesFromThread,
  refreshManySessionFromThread,
} from '@/lib/chat/manyThreadBridge';
import { mergeManySessionMessages } from '@/lib/chat/mergeManySessionMessages';
import { syncManyActiveRunIndicators } from '@/lib/chat/syncManyActiveRunIndicators';
import { syncManyDeletedIdsFromDb } from '@/lib/store/manySessionStorage';

const SESSION_LOAD_RETRY_MS = [0, 250, 600, 1200] as const;

export interface UseManySessionSyncOptions {
  chatProjectId: string;
  showHistory: boolean;
}

export function useManySessionSync({ chatProjectId, showHistory }: UseManySessionSyncOptions) {
  const { t } = useTranslation();
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const sessions = useManyStore((s) => s.sessions);
  const hydrateSession = useManyStore((s) => s.hydrateSession);
  const hydrateFromThreads = useManyStore((s) => s.hydrateFromThreads);
  const startNewChat = useManyStore((s) => s.startNewChat);

  const currentSessionIdRef = useRef<string | null>(currentSessionId);
  const refreshSessionFromThreadRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    let cancelled = false;
    void syncManyDeletedIdsFromDb()
      .then(() => {
        if (cancelled) return;
        const state = useManyStore.getState();
        const purged = filterOutDeletedSessions(state.sessions);
        if (purged.length !== state.sessions.length) {
          persistManySessions(purged);
          const nextCurrent =
            state.currentSessionId && purged.some((s) => s.id === state.currentSessionId)
              ? state.currentSessionId
              : (purged[0]?.id ?? null);
          const nextMessages =
            nextCurrent && nextCurrent === state.currentSessionId
              ? state.messages
              : (purged.find((s) => s.id === nextCurrent)?.messages ?? []);
          useManyStore.setState({
            sessions: purged,
            currentSessionId: nextCurrent,
            messages: nextMessages,
          });
        }
        return hydrateFromThreads().then(() => {
          const ids = useManyStore.getState().sessions.slice(0, 20).map((s) => s.id);
          return syncManyActiveRunIndicators(ids);
        });
      })
      .catch((err) => {
        console.warn('[Many] JSONL session hydration failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrateFromThreads]);

  const prevChatProjectIdRef = useRef(chatProjectId);
  useEffect(() => {
    if (prevChatProjectIdRef.current === chatProjectId) return;
    prevChatProjectIdRef.current = chatProjectId;
    startNewChat();
    void hydrateFromThreads();
  }, [chatProjectId, startNewChat, hydrateFromThreads]);

  useEffect(() => {
    if (!currentSessionId || !window.electron?.threads?.getState) return;

    const sessionId = currentSessionId;
    let cancelled = false;

    const loadWithRetry = async () => {
      for (const delay of SESSION_LOAD_RETRY_MS) {
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (cancelled || currentSessionIdRef.current !== sessionId) return;

        let threadMessages: Awaited<ReturnType<typeof fetchManyMessagesFromThread>> = [];
        try {
          threadMessages = await fetchManyMessagesFromThread(sessionId);
        } catch (error) {
          console.warn('[Many] Could not load session from JSONL:', error);
          continue;
        }
        if (cancelled || currentSessionIdRef.current !== sessionId) return;
        if (threadMessages.length === 0) {
          if (useManyStore.getState().messages.length > 0) return;
          continue;
        }

        const store = useManyStore.getState();
        // Don't clobber an in-flight turn with a partial JSONL snapshot.
        if (store.activeRunBySessionId[sessionId]) return;

        const localMessages = store.messages;
        if (localMessages.length > threadMessages.length) return;

        const merged = mergeManySessionMessages(localMessages, threadMessages);
        const localSession = store.sessions.find((s) => s.id === sessionId);
        const firstUser = merged.find((m) => m.role === 'user')?.content ?? '';
        hydrateSession({
          id: sessionId,
          title: deriveManySessionTitle({
            storedTitle: localSession?.title,
            messages: merged,
            firstUser,
          }),
          messages: merged,
          createdAt: localSession?.createdAt ?? merged[0]?.timestamp ?? Date.now(),
          updatedAt: merged[merged.length - 1]?.timestamp ?? localSession?.updatedAt,
          pinned: localSession?.pinned,
        } satisfies ManyChatSession);
        return;
      }
    };

    void loadWithRetry();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, hydrateSession]);

  const refreshSessionFromThread = useCallback(async (): Promise<boolean> => {
    if (!currentSessionId || !window.electron?.threads?.getState) {
      return false;
    }
    const localMessages = useManyStore.getState().messages;
    const refreshed = await refreshManySessionFromThread(currentSessionId, localMessages);
    if (!refreshed) return false;

    hydrateSession({
      id: currentSessionId,
      title: refreshed.title || currentSession?.title || t('chat.session_fallback_new'),
      messages: refreshed.messages,
      createdAt: currentSession?.createdAt ?? refreshed.messages[0]?.timestamp ?? Date.now(),
      updatedAt: refreshed.messages[refreshed.messages.length - 1]?.timestamp,
    } satisfies ManyChatSession);
    return true;
  }, [currentSession, currentSessionId, hydrateSession, t]);

  refreshSessionFromThreadRef.current = refreshSessionFromThread;

  const historySessionIdsKey = useMemo(
    () => sessions.slice(0, 20).map((s) => s.id).join('\0'),
    [sessions],
  );

  useEffect(() => {
    if (!showHistory) return;
    const ids = historySessionIdsKey.split('\0').filter(Boolean);
    if (ids.length === 0) return;
    void syncManyActiveRunIndicators(ids);
  }, [showHistory, historySessionIdsKey]);

  return {
    currentSession,
    currentSessionIdRef,
    refreshSessionFromThread,
    refreshSessionFromThreadRef,
  };
}
