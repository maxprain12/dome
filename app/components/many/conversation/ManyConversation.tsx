import {
  forwardRef,
  useImperativeHandle,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from '@/components/ui/message-scroller';
import ManyTurn from './ManyTurn';
import ManyWelcome from './ManyWelcome';
import ManyApprovalGate from './ManyApprovalGate';
import { ManyLoadingMarker, ManyErrorNotice } from './ManyNotices';
import { stableMessageGroupKey } from '@/lib/chat/stableMessageGroupKey';
import type { ManyAvatarState } from '@/components/many/ManyAvatar';
import type { ManyMessageData } from '@/lib/many/types';
import type { RunPendingApproval } from '@/lib/chat/useAgentRunStream';
import { cn } from '@/lib/utils';

export interface ManyConversationHandle {
  scrollToEnd: (behavior?: ScrollBehavior) => void;
  scrollToMessage: (messageId: string) => void;
  resetScrollLock: () => void;
}

interface ManyConversationProps {
  isFullscreen: boolean;
  isStreaming: boolean;
  isEmpty: boolean;
  messageGroups: ManyMessageData[][];
  lastUserGroupIndex: number;
  isLoading: boolean;
  hasStreamingMessage: boolean;
  showApprovalGate: boolean;
  pendingApproval: RunPendingApproval | null;
  onDismissApproval: () => void;
  onRegenerate: (messageId: string) => void;
  error: string | null;
  onRetryError: () => void;
  onReportError: () => void;
  supportsTools: boolean;
  onPrompt: (text: string) => void;
  className?: string;
}

function ScrollerHandleBridge({ handleRef }: { handleRef: Ref<ManyConversationHandle> }) {
  const { scrollToEnd, scrollToMessage } = useMessageScroller();

  useImperativeHandle(handleRef, () => ({
    scrollToEnd: (behavior: ScrollBehavior = 'auto') => {
      scrollToEnd({ behavior });
    },
    scrollToMessage: (messageId: string) => {
      scrollToMessage(messageId, { align: 'start', behavior: 'smooth' });
    },
    resetScrollLock: () => {
      scrollToEnd({ behavior: 'auto' });
    },
  }));

  return null;
}

/**
 * The transcript: a MessageScroller thread of turns, with the approval gate,
 * loading marker and error notice living inside the same flow. Empty sessions
 * render the compact welcome.
 */
const ManyConversation = forwardRef<ManyConversationHandle, ManyConversationProps>(
  function ManyConversation(
    {
      isFullscreen,
      isStreaming,
      isEmpty,
      messageGroups,
      lastUserGroupIndex,
      isLoading,
      hasStreamingMessage,
      showApprovalGate,
      pendingApproval,
      onDismissApproval,
      onRegenerate,
      error,
      onRetryError,
      onReportError,
      supportsTools,
      onPrompt,
      className,
    },
    ref,
  ) {
    const { t } = useTranslation();

    return (
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <ScrollerHandleBridge handleRef={ref} />
        <MessageScroller className={cn('min-h-0 flex-1', className)} data-surface="many">
          <MessageScrollerViewport aria-label={t('chat.messages')}>
            <MessageScrollerContent aria-busy={isStreaming} className="gap-5 px-4 py-5">
              <div
                className={cn(
                  'mx-auto flex w-full flex-col gap-5',
                  isFullscreen ? 'max-w-3xl' : 'max-w-none',
                )}
              >
                {isEmpty ? (
                  <ManyWelcome variant="panel" supportsTools={supportsTools} onPrompt={onPrompt} />
                ) : (
                  <>
                    {messageGroups.map((group, index) => {
                      const isLastGroup = index === messageGroups.length - 1;
                      const lastMsg = group[group.length - 1];
                      const groupState: ManyAvatarState =
                        isLastGroup && lastMsg?.role === 'assistant' && lastMsg?.isStreaming
                          ? 'thinking'
                          : 'idle';
                      return (
                        <ManyTurn
                          key={stableMessageGroupKey(group)}
                          messages={group}
                          onRegenerate={onRegenerate}
                          assistantState={groupState}
                          scrollAnchor={index === lastUserGroupIndex}
                        />
                      );
                    })}
                    {isLoading && !hasStreamingMessage ? (
                      <MessageScrollerItem messageId="many-analyzing">
                        <ManyLoadingMarker label={t('chat.analyzing')} />
                      </MessageScrollerItem>
                    ) : null}
                    {showApprovalGate ? (
                      <MessageScrollerItem messageId="many-approval-gate">
                        <ManyApprovalGate
                          pendingApproval={pendingApproval}
                          onDismissApproval={onDismissApproval}
                        />
                      </MessageScrollerItem>
                    ) : null}
                    {error ? (
                      <MessageScrollerItem messageId="many-error">
                        <ManyErrorNotice
                          message={error}
                          onRetry={onRetryError}
                          onReport={onReportError}
                        />
                      </MessageScrollerItem>
                    ) : null}
                  </>
                )}
              </div>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
        </MessageScroller>
      </MessageScrollerProvider>
    );
  },
);

export default ManyConversation;
