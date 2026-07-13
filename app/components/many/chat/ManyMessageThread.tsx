'use client';

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ReactNode,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from '@/components/ui/message-scroller';
import { cn } from '@/lib/utils';

export interface ManyMessageThreadHandle {
  scrollToEnd: (behavior?: ScrollBehavior) => void;
  scrollToMessage: (messageId: string) => void;
  resetScrollLock: () => void;
}

interface ManyMessageThreadProps {
  children: ReactNode;
  className?: string;
  isStreaming?: boolean;
  autoScroll?: boolean;
}

function ManyMessageThreadScrollerHandle({
  scrollerRef,
}: {
  scrollerRef: Ref<ManyMessageThreadHandle>;
}) {
  const { scrollToEnd, scrollToMessage } = useMessageScroller();

  useImperativeHandle(scrollerRef, () => ({
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

const ManyMessageThread = forwardRef<ManyMessageThreadHandle, ManyMessageThreadProps>(
  function ManyMessageThread(
    { children, className, isStreaming = false, autoScroll = true },
    ref,
  ) {
    const { t } = useTranslation();
    const innerRef = useRef<ManyMessageThreadHandle>(null);

    useImperativeHandle(ref, () => ({
      scrollToEnd: (behavior) => innerRef.current?.scrollToEnd(behavior),
      scrollToMessage: (id) => innerRef.current?.scrollToMessage(id),
      resetScrollLock: () => innerRef.current?.resetScrollLock(),
    }));

    return (
      <MessageScrollerProvider autoScroll={autoScroll} defaultScrollPosition="end">
        <ManyMessageThreadScrollerHandle scrollerRef={innerRef} />
        <MessageScroller className={cn('min-h-0 flex-1', className)} data-surface="many">
          <MessageScrollerViewport aria-label={t('chat.messages')}>
            <MessageScrollerContent
              aria-busy={isStreaming}
              className="gap-5 px-1 py-6"
            >
              {children}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
        </MessageScroller>
      </MessageScrollerProvider>
    );
  },
);

export default ManyMessageThread;
