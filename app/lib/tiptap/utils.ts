import type { Editor, JSONContent } from '@tiptap/core';
import { markdownToHtml, looksLikeMarkdown } from '@/lib/utils/markdown';

export function serializeNoteContent(editor: Editor): string {
  return JSON.stringify(editor.getJSON());
}

/**
 * Try to parse stored note content as a Tiptap doc. Returns the JSON if it
 * is valid, otherwise undefined. Kept for callers that strictly need JSON.
 */
export function deserializeNoteContent(content: string | undefined | null): JSONContent | undefined {
  if (!content || !content.trim()) return undefined;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed as JSONContent;
    return undefined;
  } catch {
    return undefined;
  }
}

export function getDefaultNoteContent(): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
}

/**
 * Walk a Tiptap node and produce a plain-text representation, preserving
 * paragraph and heading boundaries with newlines. Used to recover markdown
 * sources from documents whose blocks are flat paragraphs (e.g. AI-generated
 * notes that were stored verbatim with `|…|` table rows as paragraph text).
 */
function tiptapDocToPlainText(node: JSONContent): string {
  if (!node) return '';
  if (node.type === 'text' && typeof node.text === 'string') return node.text;
  const children = Array.isArray(node.content) ? node.content : [];
  const inner = children.map(tiptapDocToPlainText).join(node.type === 'doc' ? '\n' : '');
  if (node.type === 'heading' && node.attrs?.level) {
    return `${'#'.repeat(Number(node.attrs.level) || 1)} ${inner}`;
  }
  if (node.type === 'paragraph') return inner;
  if (node.type === 'hardBreak') return '\n';
  return inner;
}

/**
 * Heuristic: detect docs whose blocks are paragraphs containing raw markdown
 * (e.g. several consecutive lines that look like a markdown table). Tables
 * proper (`tableRow`/`tableCell`) are kept as-is.
 */
function docContainsRawMarkdown(doc: JSONContent): boolean {
  if (!Array.isArray(doc.content)) return false;
  let tableLikeRows = 0;
  let hasRealTable = false;
  for (const block of doc.content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'table' || block.type === 'tableRow') {
      hasRealTable = true;
      break;
    }
    if (block.type === 'paragraph') {
      const text = tiptapDocToPlainText(block).trim();
      if (/^\|.*\|$/.test(text)) tableLikeRows += 1;
    }
  }
  if (hasRealTable) return false;
  return tableLikeRows >= 2;
}

/**
 * Result of loading a note's stored content. Either a Tiptap JSON document
 * (preferred — already structured) or an HTML string (when we had to derive
 * it from markdown). Tiptap's `useEditor({ content })` accepts both.
 */
export type LoadedNoteContent = JSONContent | string;

/**
 * Decide what to feed Tiptap as initial content based on whatever string
 * we have in storage. Handles three real-world cases:
 *
 * 1. Valid Tiptap JSON  → return the JSON unchanged.
 * 2. Tiptap JSON whose paragraphs contain raw markdown (typical of notes
 *    drafted by an AI agent and stored verbatim) → recover the markdown
 *    text from the paragraphs and re-render it as HTML so tables, headings
 *    and lists become real Tiptap nodes.
 * 3. Bare markdown / plain text → convert via `markdownToHtml`.
 *
 * The first save after the editor mounts will rewrite storage as proper
 * Tiptap JSON, so this conversion is a one-shot upgrade for legacy data.
 */
export function loadNoteContent(content: string | undefined | null): LoadedNoteContent {
  if (!content || !content.trim()) return getDefaultNoteContent();

  const parsed = deserializeNoteContent(content);
  if (parsed) {
    if (docContainsRawMarkdown(parsed)) {
      const md = tiptapDocToPlainText(parsed).trim();
      if (md) return markdownToHtml(md);
    }
    return parsed;
  }

  if (looksLikeMarkdown(content)) return markdownToHtml(content);
  return markdownToHtml(content);
}
