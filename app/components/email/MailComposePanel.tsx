import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
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
import { fromEmail, fromLabel, type MailEnvelope } from '@/lib/email/mailQueues';
import { cn } from '@/lib/utils';

type AiAction = 'improve' | 'shorten' | 'formal' | 'generate';

export function MailComposePanel({
  mode,
  replyTo,
  folder,
  projectId,
  accountId,
  accountLabel,
  onClose,
  onSent,
}: {
  mode: 'new' | 'reply';
  replyTo?: MailEnvelope;
  folder: string;
  projectId: string;
  accountId: string;
  accountLabel: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const [to, setTo] = useState(mode === 'reply' ? fromEmail(replyTo?.from) || fromLabel(replyTo?.from) : '');
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
          ? await window.electron.email.reply({
              messageId: replyTo.dbId ?? replyTo.id,
              body,
              folder: replyTo.folder ?? folder,
              projectId,
              accountId,
            })
          : await window.electron.email.send({
              to,
              cc: cc.trim() || undefined,
              bcc: bcc.trim() || undefined,
              subject,
              body,
              projectId,
              accountId,
            });
      if (res.success) onSent();
      else {
        setError({
          error: res.error || t('email.compose_failed'),
          errorCode: res.errorCode,
          helpUrl: res.helpUrl,
        });
      }
    } catch (err) {
      setError({ error: err instanceof Error ? err.message : t('email.compose_failed') });
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
          <p className="text-sm text-muted-foreground">{t('email.sending_from', { account: accountLabel })}</p>
          <FieldGroup className="shrink-0 gap-3">
            {mode === 'new' ? (
              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={`${formId}-to`}>{t('email.to')}</FieldLabel>
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
                  id={`${formId}-to`}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={t('email.to_placeholder')}
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor={`${formId}-to`}>{t('email.to')}</FieldLabel>
                <Input id={`${formId}-to`} value={to} readOnly className="bg-muted/40" />
              </Field>
            )}

            {(showCcBcc || cc || bcc) && mode === 'new' ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`${formId}-cc`}>{t('email.cc')}</FieldLabel>
                  <Input
                    id={`${formId}-cc`}
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder={t('email.cc_placeholder')}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-bcc`}>{t('email.bcc')}</FieldLabel>
                  <Input
                    id={`${formId}-bcc`}
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder={t('email.bcc_placeholder')}
                  />
                </Field>
              </>
            ) : null}

            {mode === 'new' ? (
              <Field>
                <FieldLabel htmlFor={`${formId}-subject`}>{t('email.subject')}</FieldLabel>
                <Input
                  id={`${formId}-subject`}
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
            <FieldLabel htmlFor={`${formId}-body`}>{t('email.body')}</FieldLabel>
            <Textarea
              id={`${formId}-body`}
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

      <ConfirmDialog
        isOpen={confirmDiscard}
        title={t('email.compose')}
        message={t('common.unsaved_changes')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
