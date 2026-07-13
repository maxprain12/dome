import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { BarChartIcon, BotIcon, Calendar03Icon, ClipboardListIcon, FolderOpenIcon, Mail01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import ManyAvatar from '@/components/many/ManyAvatar';
import ManyHitlInlineSection from '@/components/many/ManyHitlInlineSection';
import CompactionNotice, { type CompactionNoticeData } from '@/components/many/CompactionNotice';
import PdfRegionBanner from '@/components/many/PdfRegionBanner';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Spinner } from '@/components/ui/spinner';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { stableMessageGroupKey } from '@/lib/chat/stableMessageGroupKey';
import type { ManyMessageData } from '@/components/many/chat/types';
import type { RunPendingApproval } from '@/lib/chat/useAgentRunStream';
import type { PendingPdfRegion } from '@/lib/store/useManyStore';
import type { ManyAvatarState } from '@/components/many/ManyAvatar';
import { cn } from '@/lib/utils';
import ManyMessageGroup, { ManyAnalyzingMarker, ManyErrorMarker } from './ManyMessageGroup';
import ManyMessageThread, { type ManyMessageThreadHandle } from './ManyMessageThread';

function ManyWelcomePill({
  label,
  onClick,
  icon,
  className,
}: {
  label: string;
  onClick: () => void;
  icon?: IconSvgElement;
  className?: string;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} className={className}>
      {icon ? <HugeiconsIcon icon={icon} data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}

interface ManyWelcomeScreenProps {
  isPopout?: boolean;
  supportsTools: boolean;
  composer?: ReactNode;
  onPrompt: (text: string) => void;
  variant: 'fullscreen' | 'sidebar-empty';
}

export function ManyWelcomeScreen({
  isPopout,
  supportsTools,
  composer,
  onPrompt,
  variant,
}: ManyWelcomeScreenProps) {
  const { t } = useTranslation();

  if (variant === 'fullscreen') {
    return (
      <div
        className={cn(
          'flex flex-1 min-h-0 flex-col items-center justify-center px-6 py-10',
          isPopout && 'pt-10',
        )}
      >
        <div className="mb-5">
          <ManyAvatar size="lg" state="idle" />
        </div>
        <h1 className="text-center text-2xl font-semibold tracking-tight">{t('chat.welcome_heading')}</h1>
        <p className="mx-auto mb-8 max-w-xl px-4 text-center text-muted-foreground">{t('many.welcome_hints')}</p>
        {composer ? <div className="mb-6 w-full max-w-2xl">{composer}</div> : null}
        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            {([
              { Icon: Search01Icon, labelKey: 'chat.quick_search_library' as const },
              { Icon: FolderOpenIcon, labelKey: 'chat.quick_organize' as const },
              { Icon: ClipboardListIcon, labelKey: 'chat.quick_prepare_meeting' as const },
            ] as const).map(({ Icon, labelKey }) => (
              <ManyWelcomePill
                key={labelKey}
                icon={Icon}
                label={t(labelKey)}
                onClick={() => onPrompt(t(labelKey))}
              />
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {([
              { Icon: BotIcon, labelKey: 'chat.quick_ai_strategy' as const },
              { Icon: BarChartIcon, labelKey: 'chat.quick_create_table' as const },
              { Icon: Calendar03Icon, labelKey: 'chat.quick_weekly_report' as const },
              { Icon: Mail01Icon, labelKey: 'chat.quick_draft_email' as const },
            ] as const).map(({ Icon, labelKey }) => (
              <ManyWelcomePill
                key={labelKey}
                icon={Icon}
                label={t(labelKey)}
                onClick={() => onPrompt(t(labelKey))}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10 text-center">
      <div className="mb-3 flex justify-center">
        <ManyAvatar size="lg" state="idle" />
      </div>
      <p className="text-[15px] font-medium">{t('chat.many_welcome_title')}</p>
      <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted-foreground">{t('chat.many_welcome_subtitle')}</p>
      <p className="mx-auto mt-3 max-w-md text-[13px] text-muted-foreground">{t('many.welcome_hints')}</p>
      <div className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-2">
        {[
          'chat.quick_empty_summarize',
          'chat.quick_empty_focus',
          'chat.quick_empty_organize',
          ...(supportsTools ? (['chat.quick_empty_search_resources', 'chat.quick_empty_query_db'] as const) : []),
        ].map((key) => (
          <ManyWelcomePill
            key={key}
            label={t(key)}
            onClick={() => onPrompt(t(key))}
            className="text-xs"
          />
        ))}
      </div>
    </div>
  );
}

interface ManyTranscriptProps {
  threadRef: RefObject<ManyMessageThreadHandle>;
  isFullscreen: boolean;
  isPopout?: boolean;
  isStreaming: boolean;
  chatMessages: ManyMessageData[];
  messageGroups: ManyMessageData[][];
  lastUserGroupIndex: number;
  streamingMessage: ManyMessageData | null;
  pdfRegionStreamingMessage: ManyMessageData | null;
  isLoading: boolean;
  showHitlInline: boolean;
  pendingApproval: RunPendingApproval | null;
  onDismissApproval: () => void;
  onRegenerate: (messageId: string) => void;
  error: string | null;
  onRetryError: () => void;
  onReportError: () => void;
  supportsTools: boolean;
  onPrompt: (text: string) => void;
}

export function ManyTranscript({
  threadRef,
  isFullscreen,
  isPopout,
  isStreaming,
  chatMessages,
  messageGroups,
  lastUserGroupIndex,
  streamingMessage,
  pdfRegionStreamingMessage,
  isLoading,
  showHitlInline,
  pendingApproval,
  onDismissApproval,
  onRegenerate,
  error,
  onRetryError,
  onReportError,
  supportsTools,
  onPrompt,
}: ManyTranscriptProps) {
  const { t } = useTranslation();
  const isEmpty = chatMessages.length === 0 && !streamingMessage && !pdfRegionStreamingMessage;

  return (
    <ManyMessageThread
      ref={threadRef}
      className={cn('flex-1 min-h-0 px-4 py-6', isPopout && 'px-3')}
      isStreaming={isStreaming}
    >
      <div
        className={cn(
          'mx-auto flex w-full flex-col gap-5',
          isFullscreen ? 'max-w-3xl' : 'max-w-none',
        )}
      >
        {isEmpty ? (
          <ManyWelcomeScreen
            variant="sidebar-empty"
            supportsTools={supportsTools}
            onPrompt={onPrompt}
          />
        ) : (
          <>
            {messageGroups.map((group, index) => {
              const isLastGroup = index === messageGroups.length - 1;
              const lastMsg = group[group.length - 1];
              const groupState: ManyAvatarState =
                isLastGroup && lastMsg?.role === 'assistant' && lastMsg?.isStreaming ? 'thinking' : 'idle';
              return (
                <ManyMessageGroup
                  key={stableMessageGroupKey(group)}
                  messages={group}
                  onRegenerate={onRegenerate}
                  assistantState={groupState}
                  scrollAnchor={index === lastUserGroupIndex}
                />
              );
            })}
            {isLoading && !streamingMessage ? <ManyAnalyzingMarker label={t('chat.analyzing')} /> : null}
            {showHitlInline ? (
              <MessageScrollerItem messageId="many-hitl">
                <ManyHitlInlineSection pendingApproval={pendingApproval} onDismissApproval={onDismissApproval} />
              </MessageScrollerItem>
            ) : null}
            {error ? (
              <ManyErrorMarker
                title={t('common.error')}
                message={error}
                onRetry={onRetryError}
                onReport={onReportError}
                retryLabel={t('chat.try_again')}
                reportLabel={t('many.error_report')}
              />
            ) : null}
          </>
        )}
      </div>
    </ManyMessageThread>
  );
}

export interface ManyPanelChromeProps {
  isVisible: boolean;
  pendingPdfRegion: PendingPdfRegion | null;
  onDismissPdfRegion: () => void;
  compactionNotice: CompactionNoticeData | null;
  onDismissCompaction: () => void;
  loadingHint?: string;
  showHitlInline: boolean;
  isLoading: boolean;
  showBottomComposer: boolean;
  isFullscreen: boolean;
  isPopout?: boolean;
  composer: ReactNode;
}

export function ManyPanelChrome({
  isVisible,
  pendingPdfRegion,
  onDismissPdfRegion,
  compactionNotice,
  onDismissCompaction,
  loadingHint,
  showHitlInline,
  isLoading,
  showBottomComposer,
  isFullscreen,
  isPopout,
  composer,
}: ManyPanelChromeProps) {
  return (
    <>
      {isVisible && pendingPdfRegion ? (
        <PdfRegionBanner pending={pendingPdfRegion} onDismiss={onDismissPdfRegion} />
      ) : null}
      {compactionNotice && !showHitlInline ? (
        <CompactionNotice event={compactionNotice} onDismiss={onDismissCompaction} />
      ) : null}
      {isLoading && loadingHint && !showHitlInline ? (
        <div className="mx-4 mb-1 px-2" aria-live="polite">
          <Marker role="status">
            <MarkerIcon>
              <Spinner />
            </MarkerIcon>
            <MarkerContent className="shimmer">{loadingHint}</MarkerContent>
          </Marker>
        </div>
      ) : null}
      {showBottomComposer ? (
        isFullscreen ? (
          <div className="shrink-0 border-t bg-background/80 backdrop-blur-sm">
            <div className={cn('mx-auto w-full max-w-3xl px-4 pb-4', isPopout && 'px-3')}>
              {composer}
            </div>
          </div>
        ) : (
          composer
        )
      ) : null}
    </>
  );
}
