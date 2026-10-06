import {
  forwardRef,
  useImperativeHandle,
  type ReactNode,
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
import { ManyLoadingMarker, ManyErrorNotice } from './ManyNotices';
import { stableMessageGroupKey } from '@/lib/chat/stableMessageGroupKey';
import type { ManyAvatarState } from '@/components/many/ManyAvatar';
import type { ManyMessageData, ManyMessageRenderer } from '@/lib/many/types';
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
  /** Draws each message of a turn. */
  renderMessage: ManyMessageRenderer;
  lastUserGroupIndex: number;
  isLoading: boolean;
  /** What the run is doing right now; shown while no assistant message exists yet. */
  loadingHint?: string;
  hasStreamingMessage: boolean;
  /** Without it no message offers to be regenerated (a cloud Many replies from the task, not from a prompt to redo). */
  onRegenerate?: (messageId: string) => void;
  error: string | null;
  onRetryError: () => void;
  onReportError?: () => void;
  /** What an empty conversation shows. */
  welcome: ReactNode;
  /** After the last turn, inside the same flow: cards the surface owns, such as something waiting for the person. */
  trailing?: ReactNode;
  className?: string;
}

function ScrollerHandleBridge({ handleRef }: { handleRef: Ref<ManyConversationHandle> }) {
  const { scrollToEnd, scrollToMessage } = useMessageScroller();

  useImperativeHandle(handleRef, () => ({
    scrollToEnd: (behavior: ScrollBehavior = 'auto') => {
      scrollToEnd({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior });
    },
    scrollToMessage: (messageId: string) => {
      scrollToMessage(messageId, { align: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
    resetScrollLock: () => {
      scrollToEnd({ behavior: 'auto' });
    },
  }));

  return null;
}

/**
 * The transcript: a MessageScroller thread of turns, with the approval gate,
 * loading marker and error notice living inside the same flow. Each message is
 * drawn by `renderMessage`, so the desktop and the cloud Manys share the flow but
 * not the cards. Empty sessions render `welcome`.
 */
const ManyConversation = forwardRef<ManyConversationHandle, ManyConversationProps>(
  function ManyConversation(
    {
      isFullscreen,
      isStreaming,
      isEmpty,
      messageGroups,
      renderMessage,
      lastUserGroupIndex,
      isLoading,
      loadingHint,
      hasStreamingMessage,
      onRegenerate,
      error,
      onRetryError,
      onReportError,
      welcome,
      trailing,
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
                  welcome
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
                          renderMessage={renderMessage}
                          onRegenerate={onRegenerate}
                          assistantState={groupState}
                          scrollAnchor={index === lastUserGroupIndex}
                        />
                      );
                    })}
                    {isLoading && !hasStreamingMessage ? (
                      <MessageScrollerItem messageId="many-analyzing">
                        <ManyLoadingMarker label={loadingHint || t('chat.analyzing')} />
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
                {trailing}
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
