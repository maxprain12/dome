import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HugeiconsIcon } from '@hugeicons/react';
import { Contact01Icon, InboxIcon, Mail01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import type { MailEnvelope, MailQueueId } from '@/lib/email/mailQueues';
import { MailMessageRow } from './MailMessageRow';

const INITIAL_VISIBLE = 40;
const LOAD_MORE = 40;

const ICONS = {
  needs_reply: Mail01Icon,
  from_network: Contact01Icon,
  waiting: InboxIcon,
  rest: InboxIcon,
} as const;

export function MailQueueSection({
  queueId,
  title,
  envelopes,
  networkEmails,
  selectedId,
  onOpen,
}: {
  queueId: MailQueueId;
  title: string;
  envelopes: MailEnvelope[];
  networkEmails: ReadonlySet<string>;
  selectedId?: string | null;
  onOpen: (env: MailEnvelope) => void;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisible(INITIAL_VISIBLE);
  }, [envelopes.length, queueId, title]);

  if (envelopes.length === 0) return null;

  const slice = envelopes.slice(0, visible);
  const remaining = envelopes.length - slice.length;

  return (
    <Card className="shrink-0 gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="flex-row items-start gap-3 space-y-0 px-4 py-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <HugeiconsIcon icon={ICONS[queueId]} className="size-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('email.agent_queue_count', { count: envelopes.length })}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5 px-2 pb-2">
        {slice.map((env) => (
          <MailMessageRow
            key={env.id}
            envelope={env}
            networkEmails={networkEmails}
            active={selectedId === env.id}
            onOpen={() => onOpen(env)}
          />
        ))}
        {remaining > 0 ? (
          <div className="px-2 py-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="w-full"
              onClick={() => setVisible((v) => v + LOAD_MORE)}
            >
              {t('email.agent_show_more', { count: Math.min(remaining, LOAD_MORE), total: remaining })}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
