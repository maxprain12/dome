import { htmlToMarkdown, looksLikeHtml } from '@/lib/utils/markdown';
import { extractPlainTextFromTiptap } from '@/lib/utils/formatting';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';

const MARKDOWN_MAX = 2000;
const HTML_MAX = 350_000;

export type ClassifiedPreviewBody = {
  html: string | null;
  markdown: string | null;
  text: string | null;
};

export type MailAddressLabel = {
  name: string;
  email: string;
  label: string;
};

export function formatMailAddress(raw: unknown): MailAddressLabel {
  const empty = { name: '', email: '', label: '' };
  let value = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null') return empty;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        value = JSON.parse(trimmed) as unknown;
      } catch {
        return { name: '', email: '', label: trimmed };
      }
    } else {
      const angled = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
      if (angled) {
        const name = angled[1].replace(/^["']|["']$/g, '').trim();
        const email = angled[2].trim();
        return { name, email, label: name || email };
      }
      if (trimmed.includes('@')) return { name: '', email: trimmed, label: trimmed };
      return { name: trimmed, email: '', label: trimmed };
    }
  }
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return empty;
  if (typeof first === 'string') return formatMailAddress(first);
  if (typeof first !== 'object') return empty;
  const rec = first as { name?: unknown; addr?: unknown; email?: unknown };
  const name = typeof rec.name === 'string' && rec.name !== 'null' ? rec.name.trim() : '';
  const email = String(rec.addr || rec.email || '').trim();
  return { name, email, label: name || email };
}

/** Full designed documents (reports, artifacts) — not Tiptap/note fragments. */
export function looksLikeHtmlDocument(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/<!doctype\s+html/i.test(trimmed)) return true;
  if (/<html[\s>]/i.test(trimmed)) return true;
  if (/<head[\s>]/i.test(trimmed)) return true;
  if (/<style[\s>]/i.test(trimmed)) return true;
  return false;
}

export function classifyPreviewContent(raw: string | null | undefined): ClassifiedPreviewBody {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { html: null, markdown: null, text: null };
  if (looksLikeHtmlDocument(trimmed)) {
    return { html: trimmed.slice(0, HTML_MAX), markdown: null, text: null };
  }
  if (looksLikeHtml(trimmed)) {
    const md = htmlToMarkdown(trimmed).trim();
    const markdown = (md || previewPlainText(trimmed)).slice(0, MARKDOWN_MAX);
    return { html: null, markdown: markdown || null, text: null };
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const addr = formatMailAddress(trimmed);
    if (addr.label) return { html: null, markdown: null, text: addr.label };
    const plain = extractPlainTextFromTiptap(trimmed);
    return { html: null, markdown: null, text: plain || null };
  }
  return { html: null, markdown: trimmed.slice(0, MARKDOWN_MAX), text: null };
}

const ISSUE_META_LINE = /^\s*[-*]\s+\*\*(Key|Rule|Severity)\*\*\s*:\s*(.+?)\s*$/i;

export type IssuePreviewFields = {
  severity: string | null;
  rule: string | null;
  markdown: string;
};

export function sanitizeIssuePreviewMarkdown(raw: string | null | undefined): IssuePreviewFields {
  const lines = String(raw || '').split(/\r?\n/);
  let severity: string | null = null;
  let rule: string | null = null;
  const kept: string[] = [];
  for (const line of lines) {
    const match = line.match(ISSUE_META_LINE);
    if (match) {
      const name = match[1].toLowerCase();
      const value = match[2].replace(/\*+/g, '').trim();
      if (name === 'key') continue;
      if (name === 'rule' && value && !looksLikeOpaqueId(value)) {
        rule = value;
        continue;
      }
      if (name === 'severity' && value) {
        severity = value;
        continue;
      }
    }
    if (/^\s*[-*]\s+\*\*[^*]*\*?\s*$/.test(line)) continue;
    kept.push(line);
  }
  const markdown = kept.join('\n').replace(/^\s*##\s+SonarQube\s*$/im, '').trim();
  return { severity, rule, markdown };
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function personContactSnippet(raw: string | null | undefined): string {
  if (!raw) return '';
  const emails = [...new Set((raw.match(EMAIL_RE) || []).map((email) => email.toLowerCase()))];
  return emails[0] || '';
}

export function previewPlainText(raw: string | null | undefined): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const addr = formatMailAddress(trimmed);
    if (addr.label) return addr.label;
    return extractPlainTextFromTiptap(trimmed);
  }
  return extractPlainTextFromTiptap(trimmed) || trimmed;
}

/** `cssVars` must be `:root` declarations only (`--background: …;`), not a full stylesheet. */
export function wrapCmdkPreviewHtml(html: string, cssVars: string): string {
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style id="dome-theme">:root{${cssVars}}html,body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans),system-ui,sans-serif;}</style>`;
  const trimmed = html.trim();
  if (/<head[^>]*>/i.test(trimmed)) {
    return trimmed.replace(/<head[^>]*>/i, (match) => `${match}${head}`);
  }
  if (/<html[^>]*>/i.test(trimmed)) {
    return trimmed.replace(/<html[^>]*>/i, (match) => `${match}<head>${head}</head>`);
  }
  return `<!doctype html><html><head>${head}</head><body>${trimmed}</body></html>`;
}
