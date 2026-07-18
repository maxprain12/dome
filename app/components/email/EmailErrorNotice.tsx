import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, ExternalLinkIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface EmailErrorInfo {
  error?: string;
  errorCode?: string;
  helpUrl?: string | null;
}

const KNOWN_CODES = new Set([
  'app_password_required',
  'auth_failed',
  'connection_failed',
  'tls_error',
  'binary_unavailable',
]);

/**
 * Turns a normalized email error ({ error, errorCode, helpUrl }) into a friendly,
 * localized, actionable message. Falls back to the raw text for unknown codes.
 */
export default function EmailErrorNotice({ info, compact = false }: { info: EmailErrorInfo | null; compact?: boolean }) {
  const { t } = useTranslation();
  if (!info) return null;

  const code = info.errorCode && KNOWN_CODES.has(info.errorCode) ? info.errorCode : null;
  const message = code ? t(`email.errors.${code}`) : info.error || t('email.errors.unknown');
  const helpUrl = info.helpUrl || (code === 'app_password_required' ? 'https://support.google.com/accounts/answer/185833' : null);

  return (
    <Alert variant="destructive" className={compact ? 'px-2 py-1.5 text-xs' : undefined}>
      <HugeiconsIcon icon={AlertCircleIcon} />
      <AlertTitle>{t('email.tab_title')}</AlertTitle>
      <AlertDescription>
        {message}
        {helpUrl && (
          <a
            href={helpUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 ml-1 underline text-destructive"
          >
            {t('email.errors.learn_more')}
            <HugeiconsIcon icon={ExternalLinkIcon} className="size-3" />
          </a>
        )}
      </AlertDescription>
    </Alert>
  );
}
