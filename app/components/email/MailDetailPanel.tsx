import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { InlineDetailCard } from '@/components/shared/InlineDetailCard';
import { DetailColumns } from '@/components/shared/DetailModal';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  const { t, i18n } = useTranslation();
  const senderName = fromName(selected.from);
  const senderEmail = fromEmail(selected.from);
  const displayName = senderName || senderEmail || t('email.unknown_sender');
  const chips = flagChips(selected.flags, t);

  return (
    <InlineDetailCard
      onClose={onClose}
      size="wide"
      bodyClassName="overflow-hidden"
      title={selected.subject || t('email.no_subject')}
      badges={chips.length ?
        <>
          {chips.map((c) => (
            <Badge
              key={c.key}
              variant="secondary"
              className="h-auto overflow-visible py-0.5 leading-none"
            >
              {c.label}
            </Badge>
          ))}
        </> : undefined
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onReply}>
            {t('email.reply')}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => { onAskMany(); onClose(); }}>
            {t('email.agent_ask_many')}
          </Button>
        </div>
      }
    >
      <DetailColumns fill context={
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3"><Avatar size="lg"><AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><p className="break-words text-sm font-semibold">{displayName}</p><p className="break-all text-xs text-muted-foreground">{senderEmail}</p></div></div>
          <dl className="flex flex-col gap-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">{t('email.reader.meta.folder')}</dt><dd className="mt-1">{emailFolderLabel(folder, t)}</dd></div>
            {selected.date ? <div><dt className="text-xs text-muted-foreground">{t('email.reader.meta.date')}</dt><dd className="mt-1">{Number.isNaN(Date.parse(selected.date)) ? selected.date : new Date(selected.date).toLocaleString(i18n.language)}</dd></div> : null}
            <div><dt className="text-xs text-muted-foreground">{t('email.reader.meta.messageId')}</dt><dd className="mt-1 break-all text-xs">{selected.id}</dd></div>
          </dl>
        </div>
      }>
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
      </DetailColumns>
    </InlineDetailCard>
  );
}
