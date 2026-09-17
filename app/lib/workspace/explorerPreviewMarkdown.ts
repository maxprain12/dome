import { htmlToMarkdown, looksLikeHtml, looksLikeMarkdown } from '@/lib/utils/markdown';

export const NOTE_PREVIEW_MARKDOWN_MAX = 8000;

function looksLikeHtmlDocument(text: string): boolean {
  return /<!doctype\s+html|<html[\s>]|<head[\s>]|<style[\s>]/i.test(text);
}

function stripNoteFrontmatter(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .trim();
}

/** Crepe sometimes persists `<br>` inside otherwise-normal Markdown. */
function unwrapLeakedHtml(source: string): string {
  return source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p(?:\s[^>]*)?>/gi, '')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div(?:\s[^>]*)?>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function noteSourceToMarkdown(source: string): string {
  if (looksLikeHtmlDocument(source) || (looksLikeHtml(source) && !looksLikeMarkdown(source))) {
    return htmlToMarkdown(source).trim();
  }
  return unwrapLeakedHtml(source).trim();
}

/** Markdown the explorer can typeset like the note editor, without leaked HTML tags. */
export function prepareNotePreviewMarkdown(
  raw: string | null | undefined,
  max = NOTE_PREVIEW_MARKDOWN_MAX,
): string {
  if (!raw) return '';
  const markdown = noteSourceToMarkdown(stripNoteFrontmatter(raw));
  if (!markdown) return '';
  if (markdown.length <= max) return markdown;
  return `${markdown.slice(0, max - 1)}…`;
}
