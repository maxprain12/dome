import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InlineDetailCard } from '@/components/shared/InlineDetailCard';
import EmailErrorNotice, { type EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { SentIcon } from '@hugeicons/core-free-icons';
import { fromLabel, type MailEnvelope } from '@/lib/email/mailQueues';

export function MailComposePanel({
  mode,
  replyTo,
  folder,
  projectId,
  onClose,
  onSent,
}: {
  mode: 'new' | 'reply';
  replyTo?: MailEnvelope;
  folder: string;
  projectId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const [to, setTo] = useState(mode === 'reply' ? fromLabel(replyTo?.from) : '');
  const [subject, setSubject] = useState(mode === 'reply' ? `Re: ${replyTo?.subject || ''}` : '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<EmailErrorInfo | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = () => {
    if (sending) return;
    if (body.trim() || (mode === 'new' && (to.trim() || subject.trim()))) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res =
        mode === 'reply' && replyTo
          ? await window.electron.email.reply({ messageId: replyTo.id, body, folder, projectId })
          : await window.electron.email.send({ to, subject, body, projectId });
      if (res.success) onSent();
      else {
        setError({
          error: res.error || t('email.compose_failed'),
          errorCode: res.errorCode,
          helpUrl: res.helpUrl,
        });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <InlineDetailCard
        onClose={requestClose}
        title={mode === 'reply' ? t('email.reply') : t('email.compose')}
        description={mode === 'reply' ? replyTo?.subject || t('email.no_subject') : undefined}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={requestClose} disabled={sending}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={sending || (mode === 'new' && !to.trim())}
              onClick={() => void send()}
            >
              {sending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />
              )}
              {t('email.send')}
            </Button>
          </div>
        }
      >
        <FieldGroup>
          {mode === 'new' ? (
            <Field>
              <FieldLabel>{t('email.to')}</FieldLabel>
              <Input autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('email.to')} />
            </Field>
          ) : null}
          {mode === 'new' ? (
            <Field>
              <FieldLabel>{t('email.subject')}</FieldLabel>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('email.subject')} />
            </Field>
          ) : null}
          <Field>
            <FieldLabel>{t('email.body')}</FieldLabel>
            <Textarea
              autoFocus={mode === 'reply'}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('email.body')}
              rows={14}
              className="resize-none"
            />
          </Field>
        </FieldGroup>
        <EmailErrorNotice info={error} compact />
      </InlineDetailCard>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('email.compose')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('common.unsaved_changes', { defaultValue: 'Se perderán los cambios no guardados.' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>
              {t('common.discard', { defaultValue: 'Descartar' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
