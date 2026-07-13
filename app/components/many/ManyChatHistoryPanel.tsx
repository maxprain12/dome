import { useState, useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useManyStore, type ManyChatSession } from '@/lib/store/useManyStore';
import { filterOutDeletedSessions, deriveManySessionTitle } from '@/lib/store/manySessionStorage';
import ChatHistorySessionList from '@/components/chat/ChatHistorySessionList';
import { buildChatHistorySections, filterAndSortSessions } from '@/components/chat/chatHistoryUtils';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

interface ManyChatHistoryPanelProps {
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession?: (id: string) => void;
  onClose: () => void;
}

export default function ManyChatHistoryPanel({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onClose,
}: ManyChatHistoryPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const liveMessages = useManyStore((s) => s.messages);

  const sessionsForList = useMemo(() => {
    const visible = filterOutDeletedSessions(sessions);
    if (!currentSessionId || liveMessages.length === 0 || visible.some((s) => s.id === currentSessionId)) {
      return visible;
    }
    const orphan: ManyChatSession = {
      id: currentSessionId,
      title: deriveManySessionTitle({ messages: liveMessages }) || t('chat.new_chat'),
      messages: liveMessages,
      createdAt: liveMessages[0]?.timestamp ?? Date.now(),
      updatedAt: liveMessages[liveMessages.length - 1]?.timestamp ?? Date.now(),
    };
    return [orphan, ...visible];
  }, [sessions, currentSessionId, liveMessages, t]);

  const sortedSessions = useMemo(
    () => filterAndSortSessions(sessionsForList, query),
    [sessionsForList, query],
  );

  const sections = useMemo(
    () => buildChatHistorySections(sortedSessions, t),
    [sortedSessions, t],
  );

  const emptyTitle = query ? t('many.search_no_results') : t('many.history_empty');

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <h2 className="flex-1 text-sm font-semibold">{t('many.history')}</h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onNewChat} aria-label={t('many.newChat')}>
          <HugeiconsIcon icon={Add01Icon} />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('many.close_chat_aria')}>
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </div>

      <div className="shrink-0 border-b px-3 py-2">
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('many.search_chats')}
            aria-label={t('many.search_chats')}
          />
        </InputGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChatHistorySessionList
          sections={sections}
          currentSessionId={currentSessionId}
          emptyTitle={emptyTitle}
          onSelectSession={(session) => {
            onSelectSession(session.id);
            onClose();
          }}
          onDeleteSession={onDeleteSession}
        />
      </div>
    </div>
  );
}
