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
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AiEditingIcon,
  MagicWand01Icon,
  Scissor01Icon,
  SentIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import { chat } from '@/lib/ai/client';
import { fromLabel, type MailEnvelope } from '@/lib/email/mailQueues';
import { cn } from '@/lib/utils';

type AiAction = 'improve' | 'shorten' | 'formal' | 'generate';

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
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState(mode === 'reply' ? `Re: ${replyTo?.subject || ''}` : '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiAction | null>(null);
  const [error, setError] = useState<EmailErrorInfo | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty =
    body.trim() ||
    cc.trim() ||
    bcc.trim() ||
    (mode === 'new' && (to.trim() || subject.trim()));

  const requestClose = () => {
    if (sending || aiBusy) return;
    if (dirty) {
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
          : await window.electron.email.send({
              to,
              cc: cc.trim() || undefined,
              bcc: bcc.trim() || undefined,
              subject,
              body,
              projectId,
            });
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

  const runAi = async (action: AiAction) => {
    const trimmed = body.trim();
    const subjectLine = subject.trim();
    if (action !== 'generate' && !trimmed) {
      setAiError(t('email.ai_need_text'));
      return;
    }
    if (action === 'generate' && !trimmed && !subjectLine) {
      setAiError(t('email.ai_need_text'));
      return;
    }

    const system =
      'Eres un asistente de correo profesional. Respondes SOLO con el cuerpo del email final, ' +
      'sin asunto, sin comillas, sin explicaciones ni preámbulos. Mantén el idioma del usuario. ' +
      'No inventes firmas ni datos de contacto.';

    let user: string;
    switch (action) {
      case 'improve':
        user = `Mejora este correo: más claro, correcto y con buen tono. Mantén el mensaje.\n\n${trimmed}`;
        break;
      case 'shorten':
        user = `Acorta este correo sin perder el mensaje ni el tono:\n\n${trimmed}`;
        break;
      case 'formal':
        user = `Reescribe este correo con un tono más formal y profesional:\n\n${trimmed}`;
        break;
      case 'generate':
        user = subjectLine
          ? `Escribe el cuerpo de un email con asunto «${subjectLine}».${trimmed ? `\nNotas / borrador:\n${trimmed}` : ''}`
          : `Escribe el cuerpo de un email a partir de estas notas:\n\n${trimmed}`;
        break;
      default: {
        const _exhaustive: never = action;
        return _exhaustive;
      }
    }

    setAiBusy(action);
    setAiError(null);
    try {
      const result = (await chat([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]))
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '');
      if (!result) throw new Error('empty response');
      setBody(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(t('email.ai_error', { error: msg }));
    } finally {
      setAiBusy(null);
    }
  };

  const aiButtons: Array<{ action: AiAction; icon: IconSvgElement; label: string }> = [
    { action: 'improve', icon: SparklesIcon, label: t('email.ai_improve') },
    { action: 'shorten', icon: Scissor01Icon, label: t('email.ai_shorten') },
    { action: 'formal', icon: AiEditingIcon, label: t('email.ai_formal') },
    { action: 'generate', icon: MagicWand01Icon, label: t('email.ai_generate') },
  ];

  return (
    <>
      <InlineDetailCard
        containerName="mail-compose"
        onClose={requestClose}
        title={mode === 'reply' ? t('email.reply') : t('email.compose')}
        description={mode === 'reply' ? replyTo?.subject || t('email.no_subject') : undefined}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={requestClose} disabled={sending || Boolean(aiBusy)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={sending || Boolean(aiBusy) || (mode === 'new' && !to.trim())}
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
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <FieldGroup className="shrink-0 gap-3">
            {mode === 'new' ? (
              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel>{t('email.to')}</FieldLabel>
                  {!showCcBcc ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
                      onClick={() => setShowCcBcc(true)}
                    >
                      {t('email.show_cc_bcc')}
                    </Button>
                  ) : null}
                </div>
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={t('email.to_placeholder')}
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel>{t('email.to')}</FieldLabel>
                <Input value={to} readOnly className="bg-muted/40" />
              </Field>
            )}

            {(showCcBcc || cc || bcc) && mode === 'new' ? (
              <>
                <Field>
                  <FieldLabel>{t('email.cc')}</FieldLabel>
                  <Input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder={t('email.cc_placeholder')}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('email.bcc')}</FieldLabel>
                  <Input
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder={t('email.bcc_placeholder')}
                  />
                </Field>
              </>
            ) : null}

            {mode === 'new' ? (
              <Field>
                <FieldLabel>{t('email.subject')}</FieldLabel>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('email.subject')}
                />
              </Field>
            ) : null}
          </FieldGroup>

          <div className="flex shrink-0 flex-wrap gap-1.5">
            {aiButtons.map(({ action, icon, label }) => (
              <Button
                key={action}
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={sending || Boolean(aiBusy)}
                onClick={() => void runAi(action)}
              >
                {aiBusy === action ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon icon={icon} data-icon="inline-start" />
                )}
                {label}
              </Button>
            ))}
          </div>

          {aiError ? (
            <p className="shrink-0 text-xs text-destructive" role="alert">
              {aiError}
            </p>
          ) : null}

          <Field className="flex min-h-0 flex-1 flex-col gap-1.5">
            <FieldLabel>{t('email.body')}</FieldLabel>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('email.body')}
              className={cn(
                'min-h-[12rem] flex-1 resize-none @[28rem]/mail-compose:min-h-[16rem]',
              )}
            />
          </Field>

          <EmailErrorNotice info={error} compact />
        </div>
      </InlineDetailCard>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('email.compose')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('common.unsaved_changes')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>
              {t('common.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
