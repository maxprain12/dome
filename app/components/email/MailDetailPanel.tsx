import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { InlineDetailCard, ColorPill } from '@/components/shared/InlineDetailCard';
import EmailBody from '@/components/email/EmailBody';
import EmailErrorNotice, { type EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import { useTranslation } from 'react-i18next';
import { fromEmail, fromName, type MailEnvelope } from '@/lib/email/mailQueues';
import { emailFolderLabel } from '@/lib/email/folder-label';

function flagChips(flags: string[] | undefined, t: (key: string) => string): { label: string; key: string }[] {
  if (!flags || flags.length === 0) return [];
  const out: { label: string; key: string }[] = [];
  const has = (kw: string) => flags.some((f) => f.toLowerCase().includes(kw.toLowerCase()));
  if (has('flagged')) out.push({ key: 'flagged', label: t('email.reader.flags.flagged') });
  if (has('answered')) out.push({ key: 'answered', label: t('email.reader.flags.answered') });
  if (has('draft')) out.push({ key: 'draft', label: t('email.reader.flags.draft') });
  return out;
}

export function MailDetailPanel({
  selected,
  reading,
  error,
  folder,
  message,
  onClose,
  onReply,
  onAskMany,
}: {
  selected: MailEnvelope;
  reading: boolean;
  error: EmailErrorInfo | null;
  folder: string;
  message: unknown;
  onClose: () => void;
  onReply: () => void;
  onAskMany: () => void;
}) {
  const { t } = useTranslation();
  const senderName = fromName(selected.from);
  const senderEmail = fromEmail(selected.from);
  const displayName = senderName || senderEmail || t('email.unknown_sender');
  const chips = flagChips(selected.flags, t);

  return (
    <InlineDetailCard
      onClose={onClose}
      title={selected.subject || t('email.no_subject')}
      description={
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate">{displayName}</span>
          {senderEmail && senderEmail !== displayName.toLowerCase() ? (
            <span className="truncate text-muted-foreground">&lt;{senderEmail}&gt;</span>
          ) : null}
        </span>
      }
      badges={
        <>
          <ColorPill>{emailFolderLabel(folder, t)}</ColorPill>
          {chips.map((c) => (
            <Badge
              key={c.key}
              variant="secondary"
              className="h-auto overflow-visible py-0.5 leading-none"
            >
              {c.label}
            </Badge>
          ))}
        </>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onReply}>
            {t('email.reply')}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onAskMany}>
            {t('email.agent_ask_many')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      {error ? (
        <div className="mb-3">
          <EmailErrorNotice info={error} compact />
        </div>
      ) : null}
      {reading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="size-4 motion-safe:animate-spin" />
          {t('email.reader.loading')}
        </div>
      ) : (
        <div
          key={selected.id}
          className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden"
        >
          <EmailBody message={message} />
        </div>
      )}
    </InlineDetailCard>
  );
}
