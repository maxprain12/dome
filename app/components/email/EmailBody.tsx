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

export interface EmailContentParts {
  html: string | null;
  text: string;
}

/** Pull the raw body string out of legacy himalaya `message read` output (string or object). */
export function extractRawBody(message: unknown): string {
  if (message == null) return '';
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.map(extractRawBody).filter(Boolean).join('\n');
  const m = message as Record<string, unknown>;
  const pick = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '');
  const nested =
    pick('text') ||
    pick('body') ||
    pick('plain') ||
    pick('content') ||
    pick('raw') ||
    pick('html');
  if (nested) return nested;
  if (m.content && typeof m.content === 'object') return extractRawBody(m.content);
  if (m.payload && typeof m.payload === 'object') return extractRawBody(m.payload);
  return '';
}

/** Normalize IPC payload `{ html, plain, text }` or legacy string/MML into render parts. */
export function extractEmailParts(message: unknown): EmailContentParts {
  if (message != null && typeof message === 'object' && !Array.isArray(message)) {
    const m = message as Record<string, unknown>;
    const html = typeof m.html === 'string' && m.html.trim() ? m.html.trim() : null;
    const text =
      (typeof m.plain === 'string' ? m.plain : '') ||
      (typeof m.text === 'string' ? m.text : '') ||
      (typeof m.body === 'string' ? m.body : '');
    if (html || text.trim()) return { html, text: text.trim() };
  }
  const raw = extractRawBody(message);
  if (!raw) return { html: null, text: '' };
  return parseMmlParts(raw);
}

/** Strip himalaya MML part delimiters (<#part …>, <#/part>, <#multipart …>, <#/multipart>). */
export function stripMmlMarkers(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\s*<#\/?(?:part|multipart)\b[^>]*>\s*$/i.test(line))
    .join('\n')
    .trim();
}

/** Parse MML multipart and return preferred HTML and/or plain text parts. */
export function parseMmlParts(body: string): EmailContentParts {
  const htmlParts: string[] = [];
  const textParts: string[] = [];
  const re = /<#part\s+type=(?:"([^"]+)"|([^\s>]+))[^>]*>\s*([\s\S]*?)\s*<#\/part>/gi;
  let match = re.exec(body);
  while (match) {
    const type = (match[1] || match[2] || '').toLowerCase();
    const content = match[3].trim();
    if (type.includes('html')) htmlParts.push(content);
    else if (type.includes('plain') || type.startsWith('text/')) textParts.push(content);
    match = re.exec(body);
  }
  if (htmlParts.length === 0 && textParts.length === 0) {
    const stripped = stripMmlMarkers(body);
    if (looksLikeHtml(stripped)) return { html: stripped, text: '' };
    return { html: null, text: stripped };
  }
  return {
    html: htmlParts.length ? htmlParts.join('\n') : null,
    text: textParts.join('\n\n'),
  };
}

function looksLikeHtml(body: string): boolean {
  return /<\s*(html|body|div|table|p|a|img|span|br|h[1-6]|ul|ol|center|font|style)\b/i.test(body);
}

/** Wrap partial HTML fragments in a document shell for iframe rendering. */
export function wrapEmailHtml(htmlBody: string): string {
  const trimmed = htmlBody.trim();
  const hasDocument = /<\s*html[\s>]/i.test(trimmed);
  if (hasDocument) return trimmed;
  return `<!doctype html><html><head><meta charset="utf-8">
    <base target="_blank">
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
           color:#1a1a1a;background:#ffffff;margin:0;padding:16px;font-size:14px;line-height:1.5;
           word-break:break-word;overflow-wrap:anywhere}
      img{max-width:100%;height:auto}
      a{color:#3b5bdb}
      table{max-width:100% !important}
    </style></head><body>${trimmed}</body></html>`;
}

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
        style={{ border: '1px solid var(--dome-border)', minHeight: '60vh', background: '#ffffff' }}
      />
    );
  }

  return (
    <pre
      className="text-sm whitespace-pre-wrap font-sans"
      style={{ color: 'var(--dome-text-secondary, var(--dome-text))', wordBreak: 'break-word' }}
    >
      {text}
    </pre>
  );
}
