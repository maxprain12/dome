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

import { extractEmailParts, wrapEmailHtml } from '@/lib/email/emailBodyParts';

export default function EmailBody({ message }: { message: unknown }) {
  const { html, text } = extractEmailParts(message);
  if (!html && !text) return null;

  if (html) {
    const srcDoc = wrapEmailHtml(html);
    return (
      <iframe
        title="email-body"
        sandbox=""
        srcDoc={srcDoc}
        className="w-full rounded-md"
        style={{ border: '1px solid var(--border)', minHeight: '60vh', background: '#ffffff' }}
      />
    );
  }

  return (
    <pre
      className="text-sm whitespace-pre-wrap font-sans"
      style={{ color: 'var(--muted-foreground, var(--foreground))', wordBreak: 'break-word' }}
    >
      {text}
    </pre>
  );
}
