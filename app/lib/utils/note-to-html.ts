/**
 * Convert note content to HTML for PDF export.
 * Handles Tiptap JSON, Markdown, and legacy HTML.
 */

import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Typography from '@tiptap/extension-typography';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import { CalloutExtension } from '@/components/editor/extensions/Callout';
import { ToggleExtension } from '@/components/editor/extensions/Toggle';
import { DividerExtension } from '@/components/editor/extensions/Divider';
import { MermaidExtension } from '@/components/editor/extensions/Mermaid';
import { PDFEmbedExtension } from '@/components/editor/extensions/PDFEmbed';
import { VideoEmbedExtension } from '@/components/editor/extensions/VideoEmbed';
import { AudioEmbedExtension } from '@/components/editor/extensions/AudioEmbed';
import { ResourceMentionExtension } from '@/components/editor/extensions/ResourceMention';
import { FileBlockExtension } from '@/components/editor/extensions/FileBlock';
import { looksLikeHtml, markdownToHtml } from './markdown';

const lowlight = createLowlight();
lowlight.register({ typescript, javascript });

const PRINT_EXTENSIONS = [
  StarterKit.configure({ codeBlock: false, dropcursor: false, gapcursor: false }),
  Typography,
  Underline,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight.configure({ multicolor: true }),
  Link.configure({ HTMLAttributes: { class: 'text-primary-600 underline' } }),
  Image.configure({ HTMLAttributes: { class: 'max-w-full h-auto rounded-lg' } }),
  CodeBlockLowlight.configure({ lowlight }),
  CalloutExtension,
  ToggleExtension,
  DividerExtension,
  MermaidExtension,
  PDFEmbedExtension,
  VideoEmbedExtension,
  AudioEmbedExtension,
  ResourceMentionExtension,
  FileBlockExtension,
];

function isJsonContent(content: string): boolean {
  if (!content?.trim()) return false;
  const t = content.trim();
  return t.startsWith('{') && t.includes('"type"') && t.includes('"doc"');
}

/**
 * Convert note content to HTML body (fragment only, no wrapping).
 */
export function contentToHtmlBody(content: string): string {
  if (!content?.trim()) return '<p></p>';
  if (isJsonContent(content)) {
    try {
      const doc = JSON.parse(content);
      return generateHTML(doc, PRINT_EXTENSIONS);
    } catch {
      return `<p>${escapeHtml(content)}</p>`;
    }
  }
  if (looksLikeHtml(content)) return content;
  return markdownToHtml(content);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PRINT_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #1f2937; padding: 24px; margin: 0; }
  h1 { font-size: 1.75rem; margin: 0 0 0.5rem; font-weight: 700; }
  h2 { font-size: 1.375rem; margin: 1.5rem 0 0.5rem; font-weight: 600; }
  h3 { font-size: 1.125rem; margin: 1.25rem 0 0.5rem; font-weight: 600; }
  p { margin: 0 0 0.75rem; }
  ul, ol { margin: 0 0 0.75rem; padding-left: 1.5rem; }
  li { margin: 0.25rem 0; }
  blockquote { border-left: 4px solid #e5e7eb; margin: 0.75rem 0; padding: 0.5rem 0 0.5rem 1rem; color: #6b7280; }
  pre, code { font-family: ui-monospace, monospace; font-size: 0.875em; background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 4px; }
  pre { padding: 0.75rem 1rem; overflow-x: auto; margin: 0.75rem 0; }
  pre code { padding: 0; background: none; }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
  th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: #f9fafb; font-weight: 600; }
  a { color: #2563eb; text-decoration: underline; }
  .callout-block { border-left: 4px solid #eab308; background: #fefce8; padding: 0.75rem 1rem; margin: 0.75rem 0; border-radius: 0 4px 4px 0; }
  .toggle-block { border: 1px solid #e5e7eb; border-radius: 4px; margin: 0.75rem 0; overflow: hidden; }
  .mermaid-block { margin: 0.75rem 0; padding: 0.75rem; background: #f9fafb; border-radius: 4px; }
  .mermaid-block svg { max-width: 100%; height: auto; }
  hr[data-type="divider"] { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
  @media print { body { padding: 0; } }
`;

/**
 * Build full HTML document for print/PDF (title, body, styles).
 * Title only in <title> to avoid duplication with H1 in content.
 */
export function contentToPrintHtml(content: string, title: string): string {
  const body = contentToHtmlBody(content);
  const hasMermaid = /data-type="mermaid"/.test(body);
  const mermaidScript = hasMermaid
    ? `
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    (async function() {
      for (let i = 0; i < 50; i++) {
        if (typeof mermaid !== 'undefined') break;
        await new Promise(r => setTimeout(r, 100));
      }
      const blocks = document.querySelectorAll('[data-type="mermaid"]');
      for (const el of blocks) {
        const pre = document.createElement('pre');
        pre.className = 'mermaid';
        pre.textContent = (el.getAttribute('data-code') || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<');
        el.innerHTML = '';
        el.appendChild(pre);
      }
      if (blocks.length && typeof mermaid !== 'undefined') {
        try {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
          await mermaid.run();
        } catch (e) { console.warn('Mermaid render error:', e); }
      }
      window.__mermaidReady = true;
    })();
  </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || 'Note')}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="note-content">${body}</div>${mermaidScript}
</body>
</html>`;
}
