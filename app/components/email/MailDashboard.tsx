import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  buildMailQueues,
  computeMailStats,
  filterEnvelopesByQuery,
  isFromNetwork,
  isRecentSent,
  isUnread,
  type MailEnvelope,
  type MailFilter,
} from '@/lib/email/mailQueues';
import { MailStats } from './MailStats';
import { MailQueueSection } from './MailQueueSection';

export function MailDashboard({
  inbox,
  sent,
  networkEmails,
  selfEmails,
  query,
  filter,
  onFilter,
  selectedId,
  onOpen,
  onCompose,
  onAskManyTriage,
  onAskManySummarize,
  compact,
  resultCount,
}: {
  inbox: MailEnvelope[];
  sent: MailEnvelope[];
  networkEmails: ReadonlySet<string>;
  selfEmails: ReadonlySet<string>;
  query: string;
  filter: MailFilter;
  onFilter: (f: MailFilter) => void;
  selectedId?: string | null;
  onOpen: (env: MailEnvelope) => void;
  onCompose: () => void;
  onAskManyTriage: () => void;
  onAskManySummarize: () => void;
  /** Narrow / detail-open layout: hide briefing chrome. */
  compact?: boolean;
  resultCount?: number | null;
}) {
  const { t } = useTranslation();
  const filtered = filterEnvelopesByQuery(inbox, query);
  const queues = buildMailQueues(filtered, networkEmails, selfEmails);
  const stats = computeMailStats(inbox, sent, networkEmails, selfEmails);
  const recentSent = filterEnvelopesByQuery(sent, query).filter((e) => isRecentSent(e));

  let needsList = queues.needsReply;
  if (filter === 'attend') {
    needsList = queues.needsReply.filter((e) => isUnread(e.flags));
  } else if (filter === 'network') {
    needsList = queues.needsReply.filter((e) => isFromNetwork(e, networkEmails));
  }

  const networkOnly =
    filter === 'network'
      ? queues.fromNetwork
      : queues.fromNetwork.filter((e) => !queues.needsReply.some((n) => n.id === e.id));

  const sections: Array<{
    key: string;
    queueId: 'needs_reply' | 'from_network' | 'waiting' | 'rest';
    title: string;
    envelopes: MailEnvelope[];
  }> = [];

  if (filter === 'recent_sent') {
    sections.push({
      key: 'recent_sent',
      queueId: 'rest',
      title: t('email.agent_queue_recent_sent'),
      envelopes: recentSent,
    });
  } else if (filter === 'network') {
    sections.push({
      key: 'from_network',
      queueId: 'from_network',
      title: t('email.agent_queue_network'),
      envelopes: queues.fromNetwork,
    });
  } else {
    if (filter === 'all' || filter === 'attend' || filter === 'needs_reply') {
      sections.push({
        key: 'needs_reply',
        queueId: 'needs_reply',
        title: t('email.agent_queue_needs_reply'),
        envelopes: needsList,
      });
    }
    if (filter === 'all') {
      sections.push({
        key: 'from_network',
        queueId: 'from_network',
        title: t('email.agent_queue_network'),
        envelopes: networkOnly,
      });
      sections.push({
        key: 'waiting',
        queueId: 'waiting',
        title: t('email.agent_queue_waiting'),
        envelopes: queues.waiting,
      });
      sections.push({
        key: 'rest',
        queueId: 'rest',
        title: t('email.agent_queue_rest'),
        envelopes: queues.rest,
      });
    }
  }

  const empty = sections.every((s) => s.envelopes.length === 0);
  const matched =
    typeof resultCount === 'number'
      ? resultCount
      : sections.reduce((n, s) => n + s.envelopes.length, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={compact ? 'shrink-0 space-y-2 p-2 pb-0' : 'shrink-0 space-y-4 p-4 pb-0'}>
        {!compact ? (
          <>
            <MailStats
              attend={stats.attend}
              network={stats.network}
              needsReply={stats.needsReply}
              recentSent={stats.recentSent}
              activeFilter={filter}
              onFilter={onFilter}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={onAskManyTriage}>
                {t('email.agent_action_triage')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onAskManySummarize}>
                {t('email.agent_action_summarize')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onCompose}>
                {t('email.compose')}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            {(
              [
                ['all', t('email.agent_filter_all')],
                ['attend', t('email.agent_stat_attend')],
                ['needs_reply', t('email.agent_stat_needs_reply')],
                ['network', t('email.agent_stat_network')],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="xs"
                variant={filter === key ? 'secondary' : 'ghost'}
                onClick={() => onFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        {query.trim() ? (
          <p className="px-1 text-xs text-muted-foreground">
            {t('email.agent_search_results', { count: matched })}
            <span className="ml-1 text-muted-foreground/80">{t('email.agent_search_hint')}</span>
          </p>
        ) : null}
      </div>

      <div
        className={
          compact
            ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2'
            : 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4'
        }
      >
        {empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('email.agent_all_clear')}</p>
        ) : null}

        {sections.map((section) => (
          <MailQueueSection
            key={section.key}
            queueId={section.queueId}
            title={section.title}
            envelopes={section.envelopes}
            networkEmails={networkEmails}
            selectedId={selectedId}
            onOpen={onOpen}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
