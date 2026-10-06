import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { PauseIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { ChatSuggestionPills } from '@/components/chat/ChatSuggestionPills';
import ManyAvatar from '@/components/many/ManyAvatar';
import ManyComposerSurface from '@/components/many/composer/ManyComposerSurface';
import ManyConversation, { type ManyConversationHandle } from '@/components/many/conversation/ManyConversation';
import type { ManyMessageRenderer } from '@/lib/many/types';
import type { Action, ManyDetail, Task } from '@/lib/manys/api';
import { buildCloudGroups } from '@/lib/manys/cloudChat';
import type { LiveRuns } from '@/lib/manys/liveRuns';
import CloudMessageView from './CloudMessageView';
import ManyReview from './ManyReview';
import ManyAccessRequest from './ManyAccessRequest';
import type { CredentialInput } from './ManyCredentialForm';

const renderCloudMessage: ManyMessageRenderer = (props) => <CloudMessageView {...props} />;

interface Props {
  detail: ManyDetail;
  runs: LiveRuns;
  inFlight: Task[];
  /** The question the agent is waiting on: the next message is the answer. */
  question: Task | null;
  failed: Task | null;
  /** What needs a decision and is not already a card inside the thread. */
  decisions: Action[];
  busy: boolean;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** Drops the question the agent asked instead of answering it. */
  onSkipQuestion: () => void;
  /** The agent asked for a sign-in: store what the person typed and tell the agent it can go on. */
  onSaveAccess: (input: CredentialInput) => void | Promise<void>;
  onDeclineAccess: () => void;
  onRetry: () => void;
  paused: boolean;
  onResume: () => void;
  suggestions: string[];
  /** What the agent is doing right now, while no reply has started. */
  doing: string;
  /** Opens what the latest turn produced in the library. Without it the person is not offered the buttons. */
  onOpenResource?: (id: string) => void;
}

/**
 * The cloud Many's conversation, drawn with the local Many's own flow so the two read alike: the
 * same turns, tool trace, error notice and composer, with messages drawn by a view that needs nothing from the desktop. What the cloud adds (a decision waiting for the
 * person, a pause) sits inside the same flow.
 */
export default function CloudManyChat({
  detail, runs, inFlight, question, failed, decisions, busy, perform, draft, onDraft, onSend, onStop, onSkipQuestion, onSaveAccess, onDeclineAccess, onRetry, paused, onResume, suggestions, doing, onOpenResource,
}: Props) {
  const { t } = useTranslation();
  const handle = useRef<ManyConversationHandle>(null);
  const groups = useMemo(() => buildCloudGroups({ detail, runs, inFlight, question }), [detail, runs, inFlight, question]);
  const lastUserGroupIndex = useMemo(() => {
    for (let index = groups.length - 1; index >= 0; index -= 1) if (groups[index][0]?.role === 'user') return index;
    return -1;
  }, [groups]);
  const hasStreamingMessage = groups.some((group) => group.some((message) => message.isStreaming));
  const working = inFlight.length > 0;
  const reason = failed?.checkpoint?.reason ?? '';
  const failure = failed
    ? t(`manys.errors.${reason.split(':')[0]}`, { defaultValue: reason || t('manys.failedBody') })
    : null;
  const empty = groups.length === 0;
  // A question that is really a request for a sign-in is answered with a form, not a message.
  const access = question?.checkpoint?.access ?? null;
  const waiting = decisions.length > 0 || (detail.conflicts ?? []).length > 0;
  // What the latest finished turn produced in the library.
  const produced = detail.tasks[0]?.result?.resources ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ManyConversation
        ref={handle}
        isFullscreen
        isStreaming={working}
        isEmpty={empty}
        messageGroups={groups}
        renderMessage={renderCloudMessage}
        lastUserGroupIndex={lastUserGroupIndex}
        isLoading={working}
        loadingHint={doing || undefined}
        hasStreamingMessage={hasStreamingMessage}
        error={failure}
        onRetryError={onRetry}
        welcome={(
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <ManyAvatar size="lg" state="idle" />
            <p className="text-[15px] font-semibold tracking-tight">{detail.many.name}</p>
            <ChatSuggestionPills
              className="mx-auto max-w-md"
              items={suggestions.map((text) => ({ id: text, label: text, onClick: () => onDraft(text) }))}
            />
          </div>
        )}
        trailing={(
          <>
            {onOpenResource && produced.length > 0 && !working && (
              <div className="flex flex-wrap gap-2 sm:ml-9">
                {produced.map((id) => <Button key={id} type="button" size="sm" variant="outline" onClick={() => onOpenResource(id)}>{t('manys.openResource')}</Button>)}
              </div>
            )}
            {access && !paused && <ManyAccessRequest request={access} reason={question?.question ?? null} busy={busy} onSave={onSaveAccess} onDecline={onDeclineAccess} />}
            {waiting && <ManyReview detail={{ ...detail, actions: decisions }} busy={busy} perform={perform} />}
          </>
        )}
      />
      {question && !access && !paused && (
        <Button type="button" variant="ghost" size="sm" className="mx-4 self-start" disabled={busy} onClick={onSkipQuestion}>{t('manys.skipQuestion')}</Button>
      )}
      {paused ? (
        <div className="dome-card dome-card-warn mx-3 mb-3 flex items-center gap-3 px-3 py-2.5 text-sm" role="status">
          <HugeiconsIcon icon={PauseIcon} className="size-4 shrink-0" aria-hidden />
          <div className="flex min-w-0 grow flex-col">
            <strong className="font-semibold">{t('manys.pause.paused')}</strong>
            <span className="text-muted-foreground">{t('manys.pause.pausedHint')}</span>
          </div>
          <Button type="button" size="sm" disabled={busy} onClick={onResume}>{t('manys.pause.resume')}</Button>
        </div>
      ) : (
        <ManyComposerSurface
          className="mx-auto w-full max-w-3xl"
          value={draft}
          onValueChange={onDraft}
          onSend={onSend}
          onStop={onStop}
          placeholder={question ? t('manys.answerPlaceholder') : t('manys.message')}
          sendLabel={t('manys.send')}
          stopLabel={t('manys.stopReply')}
          isLoading={working && !question}
          disabled={busy && !working}
          maxLength={50000}
        />
      )}
    </div>
  );
}
