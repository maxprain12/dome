import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { DashboardDataTable } from '@/components/shared/dashboard/DashboardDataTable';
import { cn } from '@/lib/utils';
import {
  buildMailQueues,
  computeMailStats,
  filterEnvelopesByQuery,
  formatMailDate,
  fromLabel,
  isFromNetwork,
  isRecentSent,
  isUnread,
  type MailEnvelope,
  type MailFilter,
} from '@/lib/email/mailQueues';

function envelopeId(env: MailEnvelope): string {
  return env.dbId ?? env.id;
}

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
  const { t, i18n } = useTranslation();
  const filtered = filterEnvelopesByQuery(inbox, query);
  const queues = buildMailQueues(filtered, networkEmails, selfEmails);
  const stats = computeMailStats(inbox, sent, networkEmails, selfEmails);
  const recentSent = filterEnvelopesByQuery(sent, query).filter((e) => isRecentSent(e));
  const attendList = filtered.filter((e) => isUnread(e.flags));

  const rowsByFilter: Record<Exclude<MailFilter, 'all'>, MailEnvelope[]> = {
    attend: attendList,
    network: queues.fromNetwork,
    needs_reply: queues.needsReply,
    recent_sent: recentSent,
  };

  const activeTab: Exclude<MailFilter, 'all'> =
    filter === 'all' || filter === 'attend' || filter === 'network' || filter === 'needs_reply' || filter === 'recent_sent'
      ? filter === 'all'
        ? 'attend'
        : filter
      : 'attend';

  const envelopes = rowsByFilter[activeTab];
  const tableRows = useMemo(
    () =>
      envelopes.map((env) => ({
        id: envelopeId(env),
        envelope: env,
      })),
    [envelopes],
  );

  const matched =
    typeof resultCount === 'number' ? resultCount : envelopes.length;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4">
      {query.trim() ? (
        <p className="pb-2 text-xs text-muted-foreground">
          {t('email.agent_search_results', { count: matched })}
        </p>
      ) : null}
      <DashboardDataTable
        tabs={[
          { id: 'attend', label: t('email.agent_stat_attend'), count: stats.attend },
          { id: 'network', label: t('email.agent_stat_network'), count: stats.network },
          { id: 'needs_reply', label: t('email.agent_stat_needs_reply'), count: stats.needsReply },
          { id: 'recent_sent', label: t('email.agent_stat_recent_sent'), count: stats.recentSent },
        ]}
        tab={activeTab}
        onTabChange={(next) => {
          if (next === 'attend' || next === 'network' || next === 'needs_reply' || next === 'recent_sent') {
            onFilter(next);
          }
        }}
        columns={[
          {
            id: 'from',
            header: t('email.from'),
            className: 'w-[12rem]',
            cell: (row) => {
              const sender = fromLabel(row.envelope.from) || t('email.unknown_sender');
              return (
                <span className={cn('block truncate', isUnread(row.envelope.flags) && 'font-medium')}>
                  {sender}
                </span>
              );
            },
          },
          {
            id: 'subject',
            header: t('email.subject'),
            cell: (row) => (
              <span className="block truncate">{row.envelope.subject || t('email.no_subject')}</span>
            ),
          },
          {
            id: 'status',
            header: t('email.status'),
            className: 'w-[11rem]',
            cell: (row) => (
              <div className="flex flex-nowrap gap-1">
                {isUnread(row.envelope.flags) ? <Badge variant="secondary">{t('email.unread')}</Badge> : null}
                {isFromNetwork(row.envelope, networkEmails) ? (
                  <Badge variant="outline">{t('email.agent_stat_network')}</Badge>
                ) : null}
              </div>
            ),
          },
          {
            id: 'date',
            header: t('email.date'),
            className: 'w-[6rem]',
            cell: (row) => formatMailDate(row.envelope.date, i18n.language),
          },
        ]}
        rows={tableRows}
        emptyTitle={t('email.agent_all_clear')}
        selectedId={selectedId}
        onRowClick={(row) => onOpen(row.envelope)}
      />
    </div>
  );
}
