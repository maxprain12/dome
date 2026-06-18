import { useTranslation } from 'react-i18next';
import { AlertCircle, ExternalLink } from 'lucide-react';

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
    <div
      className={`flex items-start gap-2 rounded-md ${compact ? 'text-xs px-2 py-1.5' : 'text-sm px-3 py-2.5'}`}
      style={{
        color: 'var(--dome-error)',
        background: 'var(--dome-error-bg, color-mix(in srgb, var(--dome-error) 10%, transparent))',
      }}
    >
      <AlertCircle className="size-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span>{message}</span>
        {helpUrl && (
          <a
            href={helpUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 ml-1 underline"
            style={{ color: 'var(--dome-error)' }}
          >
            {t('email.errors.learn_more')}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}
