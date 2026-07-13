import { useState, useMemo, startTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Cancel01Icon, Search01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useManyStore, type ManyChatSession } from '@/lib/store/useManyStore';
import { filterOutDeletedSessions } from '@/lib/store/manySessionStorage';
import { useTabStore } from '@/lib/store/useTabStore';
import ChatHistorySessionList from './ChatHistorySessionList';
import { buildChatHistorySections, filterAndSortSessions } from './chatHistoryUtils';

import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
function deleteChatSession(sessionId: string) {
  void useManyStore.getState().deleteSession(sessionId);
}

interface ChatHistoryPanelProps {
  onClose: () => void;
  /** Columna derecha dentro de Many fullscreen. */
  placement?: 'shell-right' | 'inline-right';
}

export default function ChatHistoryPanel({ onClose, placement = 'shell-right' }: ChatHistoryPanelProps) {
  const { t } = useTranslation();
  const sessions = useManyStore((s) => filterOutDeletedSessions(s.sessions));
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const [searchQuery, setSearchQuery] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const sortedSessions = useMemo(
    () => filterAndSortSessions(sessions, searchQuery),
    [sessions, searchQuery],
  );

  const sections = useMemo(
    () => buildChatHistorySections(sortedSessions, t),
    [sortedSessions, t],
  );

  const handleNewChat = () => {
    useManyStore.getState().startNewChat();
    const sessionId = useManyStore.getState().currentSessionId;
    if (sessionId) useTabStore.getState().openChatTab(sessionId, t('chat.new_chat'));
  };

  const handleOpenSession = (session: ManyChatSession) => {
    if (session.id === currentSessionId) return;
    startTransition(() => {
      useManyStore.getState().switchSession(session.id);
    });
    useTabStore.getState().openChatTab(session.id, session.title || t('chat.new_chat'));
  };

  const handleStartRename = (s: ManyChatSession) => {
    setRenameId(s.id);
    setRenameValue(s.title || t('chat.new_chat'));
  };

  const handleApplyRename = (e: FormEvent) => {
    e.preventDefault();
    if (renameId && renameValue.trim()) {
      useManyStore.getState().updateSessionTitle(renameId, renameValue.trim());
    }
    setRenameId(null);
  };

  const newChatLabel = t('chat.new_chat');
  const emptyTitle = searchQuery ? t('chat.no_results') : t('chat.no_chats');

  return (
    <div
      className={cn(
        'chat-history-panel',
        placement === 'inline-right' && 'chat-history-panel--inline-right',
      )}
    >
      <Dialog open={Boolean(renameId)} onOpenChange={(open) => !open && setRenameId(null)}>
        <DialogContent className="max-w-sm gap-4" showCloseButton={false}>
          <form
            onSubmit={handleApplyRename}
            aria-labelledby="chat-rename-dialog-title"
          >
            <DialogHeader className="mb-4">
              <DialogTitle id="chat-rename-dialog-title">{t('chat.rename_conversation')}</DialogTitle>
            </DialogHeader>
            <Input autoFocus className="mb-4" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            <DialogFooter>
              <Button type="button"
  variant="ghost"
  onClick={() => setRenameId(null)}
  size="sm">
                {t('common.cancel')}
              </Button>
              <Button type="submit"
  size="sm"><HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <header className="chat-history-hd">
        <h3 className="chat-history-hd__title">{t('chat.chats_title')}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="many-icon-btn"
          onClick={handleNewChat}
          title={newChatLabel}
          aria-label={newChatLabel}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="many-icon-btn"
          onClick={onClose}
          aria-label={t('chat.close_chat')}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </Button>
      </header>

      <div className="chat-history-search">
        <InputGroup className="chat-history-search-box">
          <InputGroupAddon><HugeiconsIcon icon={Search01Icon} className="size-3.5" aria-hidden /></InputGroupAddon>
          <InputGroupInput
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('many.search_chats')}
            aria-label={t('many.search_chats')}
          />
        </InputGroup>
      </div>

      <ChatHistorySessionList
        sections={sections}
        currentSessionId={currentSessionId}
        emptyTitle={emptyTitle}
        onSelectSession={handleOpenSession}
        onStartRename={handleStartRename}
        onDeleteSession={deleteChatSession}
      />
    </div>
  );
}
