import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import {
  formatMailDate,
  fromLabel,
  isFromNetwork,
  isUnread,
  type MailEnvelope,
} from '@/lib/email/mailQueues';

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed[0]?.toUpperCase() ?? '?';
}

export function MailMessageRow({
  envelope,
  networkEmails,
  active,
  onOpen,
  compact,
}: {
  envelope: MailEnvelope;
  networkEmails: ReadonlySet<string>;
  active?: boolean;
  onOpen: () => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const sender = fromLabel(envelope.from) || t('email.unknown_sender');
  const unread = isUnread(envelope.flags);
  const network = isFromNetwork(envelope, networkEmails);
  const dateLabel = formatMailDate(envelope.date, i18n.language);

  return (
    <div
      className={
        active
          ? 'group flex w-full items-start gap-2 rounded-md bg-accent px-1.5 py-1'
          : 'group flex w-full items-start gap-2 rounded-md px-1.5 py-1 hover:bg-accent'
      }
    >
      {!compact ? (
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
        >
          {monogram(sender)}
        </span>
      ) : (
        <span
          aria-hidden
          className={
            unread
              ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-primary'
              : 'mt-1.5 size-1.5 shrink-0 rounded-full bg-transparent'
          }
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-col gap-0.5 text-left">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={
                unread
                  ? 'min-w-0 flex-1 truncate text-sm font-medium text-foreground'
                  : 'min-w-0 flex-1 truncate text-sm text-foreground'
              }
            >
              {sender}
            </span>
            {dateLabel ? (
              <time
                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                dateTime={envelope.date || undefined}
                title={envelope.date || undefined}
              >
                {dateLabel}
              </time>
            ) : null}
          </span>
          <span
            className={
              unread
                ? 'truncate text-sm text-foreground'
                : 'truncate text-sm text-muted-foreground'
            }
          >
            {envelope.subject || t('email.no_subject')}
          </span>
        </button>
        {!compact && (unread || network) ? (
          <div className="flex flex-wrap gap-1">
            {unread ? (
              <Badge
                variant="secondary"
                className="h-auto overflow-visible py-0.5 leading-none [&_svg]:size-2.5"
              >
                {t('email.agent_pill_unread')}
              </Badge>
            ) : null}
            {network ? (
              <Badge
                variant="outline"
                className="h-auto overflow-visible py-0.5 leading-none [&_svg]:size-2.5"
              >
                {t('email.agent_pill_network')}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
