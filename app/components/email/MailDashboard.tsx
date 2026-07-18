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
  resultCount?: number | null;
}) {
  const { t } = useTranslation();
  const filtered = filterEnvelopesByQuery(inbox, query);
  const queues = buildMailQueues(filtered, networkEmails, selfEmails);
  const stats = computeMailStats(inbox, sent, networkEmails, selfEmails);
  const recentSent = filterEnvelopesByQuery(sent, query).filter((e) => isRecentSent(e));

  let needsList = queues.needsReply;
  if (filter === 'network') {
    needsList = queues.needsReply.filter((e) => isFromNetwork(e, networkEmails));
  }

  // Match computeMailStats.attend (all unread in current folder listing).
  const attendList = filtered.filter((e) => isUnread(e.flags));

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
  } else if (filter === 'attend') {
    sections.push({
      key: 'attend',
      queueId: 'needs_reply',
      title: t('email.agent_stat_attend'),
      envelopes: attendList,
    });
  } else if (filter === 'network') {
    sections.push({
      key: 'from_network',
      queueId: 'from_network',
      title: t('email.agent_queue_network'),
      envelopes: queues.fromNetwork,
    });
  } else {
    if (filter === 'all' || filter === 'needs_reply') {
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
    <div className="@container/mail-dash flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-3 p-3 pb-0 @[36rem]/mail-dash:space-y-4 @[36rem]/mail-dash:p-4">
        <MailStats
          attend={stats.attend}
          network={stats.network}
          needsReply={stats.needsReply}
          recentSent={stats.recentSent}
          activeFilter={filter}
          onFilter={onFilter}
        />

        {query.trim() ? (
          <p className="px-1 text-xs text-muted-foreground">
            {t('email.agent_search_results', { count: matched })}
            <span className="ml-1 text-muted-foreground/80">{t('email.agent_search_hint')}</span>
          </p>
        ) : null}
      </div>

      <div className="isolate min-h-0 flex-1 basis-0 space-y-3 overflow-y-auto overscroll-contain p-3 @[36rem]/mail-dash:space-y-4 @[36rem]/mail-dash:p-4">
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
          />
        ))}
      </div>
    </div>
  );
}
