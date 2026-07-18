/**
 * Renders an email body coming from himalaya `message read` / `message export`.
 *
 * Display path: `message export` writes `index.html` (HTML part) and `plain.txt`
 * (plain part). `message read` alone only returns plain text when both exist.
 *
 * NOTE: the inline CSS below uses literal colors on purpose — email HTML is
 * authored against a white canvas and CSS variables do not cross into a
 * sandboxed iframe. This file is allow-listed in scripts/check-hardcoded-colors.mjs.
 */

import { useTranslation } from 'react-i18next';
import { extractEmailParts, wrapEmailHtml } from '@/lib/email/emailBodyParts';

export default function EmailBody({ message }: { message: unknown }) {
  const { t } = useTranslation();
  const { html, text } = extractEmailParts(message);
  if (!html && !text) {
    return (
      <div className="flex flex-col gap-1 py-8 text-center studio-view-enter">
        <p className="text-sm font-medium text-foreground">{t('email.reader.empty_body.title')}</p>
        <p className="text-xs text-muted-foreground">{t('email.reader.empty_body.subtitle')}</p>
      </div>
    );
  }

  if (html) {
    const srcDoc = wrapEmailHtml(html);
    return (
      <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden studio-view-enter">
        <iframe
          title="email-body"
          sandbox=""
          srcDoc={srcDoc}
          className="block min-h-[12rem] w-full max-w-full flex-1 rounded-md border-0"
          style={{
            border: '1px solid var(--border)',
            background: '#ffffff',
          }}
        />
      </div>
    );
  }

  return (
    <pre
      className="max-w-full min-w-0 overflow-x-hidden text-sm whitespace-pre-wrap break-words font-sans studio-view-enter"
      style={{ color: 'var(--muted-foreground, var(--foreground))' }}
    >
      {text}
    </pre>
  );
}
