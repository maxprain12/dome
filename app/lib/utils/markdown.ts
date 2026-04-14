import { marked } from 'marked';
import TurndownService from 'turndown';

/** DOM nodes passed to Turndown custom rules (browser). */
type TdEl = HTMLElement;

marked.setOptions({ gfm: true, breaks: true });

/**
 * Heuristically detect if the string looks like HTML.
 */
export function looksLikeHtml(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.startsWith('<') && t.includes('>')) return true;
  if (/<\w+[\s>]/.test(t)) return true;
  return false;
}

let _turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (_turndown) return _turndown;
  _turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });
  // Callout: <div data-type="callout" data-icon="x" data-color="y">content</div>
  _turndown.addRule('callout', {
    filter: (node: TdEl) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'callout',
    replacement: (_content: string, node: TdEl) => {
      const icon = node.getAttribute('data-icon') || 'lightbulb';
      const color = node.getAttribute('data-color') || 'yellow';
      const inner = _content.trim();
      return `\n:::callout {icon="${icon}" color="${color}"}\n${inner}\n:::\n\n`;
    },
  });
  // Toggle: <div data-type="toggle">
  _turndown.addRule('toggle', {
    filter: (node: TdEl) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'toggle',
    replacement: (_content: string) => `\n:::toggle\n${_content.trim()}\n:::\n\n`,
  });
  // Divider: <hr data-type="divider">
  _turndown.addRule('divider', {
    filter: (node: TdEl) => node.nodeName === 'HR' && node.getAttribute('data-type') === 'divider',
    replacement: () => '\n---\n\n',
  });
  // PDF embed, Video embed, etc. - extract from data attrs
  _turndown.addRule('pdfEmbed', {
    filter: (node: TdEl) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'pdf-embed',
    replacement: (_content: string, node: TdEl) => {
      const rid = node.getAttribute('data-resource-id') || '';
      const ps = node.getAttribute('data-page-start') || '1';
      const pe = node.getAttribute('data-page-end');
      const z = node.getAttribute('data-zoom') || '1';
      let attrs = `resourceId="${rid}" pageStart="${ps}" zoom="${z}"`;
      if (pe) attrs += ` pageEnd="${pe}"`;
      return `\n:::pdfEmbed {${attrs}}\n\n`;
    },
  });
  _turndown.addRule('videoEmbed', {
    filter: (node: TdEl) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'video-embed',
    replacement: (_content: string, node: TdEl) => {
      const src = node.getAttribute('data-src') || '';
      const prov = node.getAttribute('data-provider') || 'direct';
      const vid = node.getAttribute('data-video-id') || '';
      let attrs = `src="${src.replace(/"/g, '&quot;')}" provider="${prov}"`;
      if (vid) attrs += ` videoId="${vid}"`;
      return `\n:::videoEmbed {${attrs}}\n\n`;
    },
  });
  _turndown.addRule('audioEmbed', {
    filter: (node: TdEl) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'audio-embed',
    replacement: (_content: string, node: TdEl) => {
      const src = node.getAttribute('data-src') || '';
      const local = node.getAttribute('data-is-local') === 'true';
      const attrs = `src="${src.replace(/"/g, '&quot;')}"${local ? ' isLocal="true"' : ''}`;
      return `\n:::audioEmbed {${attrs}}\n\n`;
    },
  });
  _turndown.addRule('fileBlock', {
    filter: (node: TdEl) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'file-block',
    replacement: (_content: string, node: TdEl) => {
      const rid = node.getAttribute('data-resource-id') || '';
      const fn = node.getAttribute('data-filename') || '';
      const attrs = `resourceId="${rid}" filename="${(fn || '').replace(/"/g, '&quot;')}"`;
      return `\n:::fileBlock {${attrs}}\n\n`;
    },
  });
  // Mermaid: <div data-type="mermaid" data-code="...">
  _turndown.addRule('mermaid', {
    filter: (node: TdEl) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'mermaid',
    replacement: (_content: string, node: TdEl) => {
      const code = node.getAttribute('data-code') || node.textContent || '';
      return `\n:::mermaid\n\`\`\`mermaid\n${code.trim()}\n\`\`\`\n:::\n\n`;
    },
  });
  // Resource mention: <span data-type="resource-mention" data-resource-id="x" data-title="y">
  _turndown.addRule('status', {
    filter: (node: TdEl) => node.nodeName === 'SPAN' && node.getAttribute('data-type') === 'status',
    replacement: (_content: string, node: TdEl) => {
      const text = (node as HTMLElement).textContent || 'Status';
      return `\`[${text}]\``;
    },
  });
  _turndown.addRule('resourceMention', {
    filter: (node: TdEl) => node.nodeName === 'SPAN' && node.getAttribute('data-type') === 'resource-mention',
    replacement: (_content: string, node: TdEl) => {
      const rid = node.getAttribute('data-resource-id') || '';
      const label = node.textContent || node.getAttribute('data-title') || 'Resource';
      return `@[${label}](${rid})`;
    },
  });
  // Task list: <li data-type="taskItem"> with checkbox
  _turndown.addRule('taskListItem', {
    filter: (node: TdEl) =>
      node.nodeName === 'LI' &&
      node.getAttribute('data-type') === 'taskItem' &&
      node.parentElement?.getAttribute('data-type') === 'taskList',
    replacement: (content: string, node: TdEl) => {
      const checkbox = node.querySelector(
        'input[type="checkbox"]'
      ) as HTMLInputElement | null;
      const checked = checkbox?.checked ?? node.getAttribute('data-checked') === 'true';
      const prefix = `- ${checked ? '[x]' : '[ ]'} `;
      const inner = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, '\n  ');
      return prefix + inner + (node.nextSibling && !/\n$/.test(inner) ? '\n' : '');
    },
  });
  return _turndown;
}

/**
 * Convert HTML to Markdown. Used when saving notes (editor outputs HTML, we store Markdown).
 */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return '';
  try {
    return getTurndown().turndown(html);
  } catch {
    return html;
  }
}

/**
 * Check if content contains custom blocks (:::callout, :::toggle, @[mention], etc.)
 * that @tiptap/markdown does not natively support.
 */
export function hasCustomBlocks(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return /:::|@\[/.test(text);
}

/**
 * Heuristically detect if the string looks like Markdown.
 * Only converts when clear Markdown signs are present to avoid
 * double-converting HTML or corrupting plain text.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  // Strip BOM if present (can appear when content is read from file)
  const t = text.replace(/^\uFEFF/, '').trim();
  if (t.length === 0) return false;
  // Headers: # ## ### ####
  if (/^#{1,6}\s/m.test(t)) return true;
  // Table syntax: | ... |
  if (/\|[^\n]+\|/m.test(t)) return true;
  // Code blocks: ``` or ``
  if (/```|`[^`]+`/.test(t)) return true;
  // Bold/italic: ** or * or __
  if (/\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__/.test(t)) return true;
  // Lists: - or * or 1. at line start
  if (/^[\s]*[-*]\s/m.test(t)) return true;
  if (/^[\s]*\d+\.\s/m.test(t)) return true;
  // Blockquote: > at line start
  if (/^[\s]*>\s/m.test(t)) return true;
  // Horizontal rule: --- or *** or ___ (at line start)
  if (/(^|\n)[\s]*(-{3,}|\*{3,}|_{3,})[\s]*($|\n)/.test(t)) return true;
  // Inline links: [text](url)
  if (/\[.+?\]\(.+?\)/.test(t)) return true;
  // Images: ![alt](url)
  if (/!\[.*?\]\(.+?\)/.test(t)) return true;
  return false;
}

/**
 * Convert our custom ::: blocks to HTML so marked can be used for the rest.
 * Marked doesn't understand :::callout etc., so we preprocess.
 */
function preprocessCustomBlocks(md: string): string {
  let out = md;
  // :::callout {icon="x" color="y"}\ncontent\n:::
  out = out.replace(/:::callout\s*(\{[^}]*\})?\s*\n([\s\S]*?)\n:::/g, (_m, attrs, inner) => {
    const icon = attrs?.match(/icon=["']([^"']*)["']/)?.[1] || 'lightbulb';
    const color = attrs?.match(/color=["']([^"']*)["']/)?.[1] || 'yellow';
    const htmlInner = marked.parse(preprocessCustomBlocks(inner.trim())) as string;
    return `<div data-type="callout" data-icon="${icon}" data-color="${color}">${htmlInner}</div>`;
  });
  // :::toggle ... :::
  out = out.replace(/:::toggle\s*\n([\s\S]*?)\n:::/g, (_m, inner) => {
    const htmlInner = marked.parse(preprocessCustomBlocks(inner.trim())) as string;
    return `<div data-type="toggle">${htmlInner}</div>`;
  });
  // :::pdfEmbed {attrs} ::: and other atom blocks
  out = out.replace(/:::pdfEmbed\s*(\{[^}]*\})?\s*:::/g, (_m, attrs) => {
    const rid = attrs?.match(/resourceId=["']([^"']*)["']/)?.[1] || '';
    const ps = attrs?.match(/pageStart=["']([^"']*)["']/)?.[1] || '1';
    const pe = attrs?.match(/pageEnd=["']([^"']*)["']/)?.[1] || '';
    const z = attrs?.match(/zoom=["']([^"']*)["']/)?.[1] || '1';
    return `<div data-type="pdf-embed" data-resource-id="${rid}" data-page-start="${ps}" data-zoom="${z}"${pe ? ` data-page-end="${pe}"` : ''} class="pdf-embed-block"></div>`;
  });
  out = out.replace(/:::videoEmbed\s*(\{[^}]*\})?\s*:::/g, (_m, attrs) => {
    const src = attrs?.match(/src=["']([^"']*)["']/)?.[1] || '';
    const prov = attrs?.match(/provider=["']([^"']*)["']/)?.[1] || 'direct';
    const vid = attrs?.match(/videoId=["']([^"']*)["']/)?.[1] || '';
    return `<div data-type="video-embed" data-src="${src.replace(/"/g, '&quot;')}" data-provider="${prov}"${vid ? ` data-video-id="${vid}"` : ''} class="video-embed-block"></div>`;
  });
  out = out.replace(/:::audioEmbed\s*(\{[^}]*\})?\s*:::/g, (_m, attrs) => {
    const src = attrs?.match(/src=["']([^"']*)["']/)?.[1] || '';
    const local = attrs?.match(/isLocal=["']true["']/);
    return `<div data-type="audio-embed" data-src="${src.replace(/"/g, '&quot;')}" data-is-local="${local ? 'true' : 'false'}" class="audio-embed-block"></div>`;
  });
  out = out.replace(/:::fileBlock\s*(\{[^}]*\})?\s*:::/g, (_m, attrs) => {
    const rid = attrs?.match(/resourceId=["']([^"']*)["']/)?.[1] || '';
    const fn = attrs?.match(/filename=["']([^"']*)["']/)?.[1] || '';
    return `<div data-type="file-block" data-resource-id="${rid}" data-filename="${fn.replace(/"/g, '&quot;')}" class="file-block"></div>`;
  });
  // :::mermaid {code="..."} ::: (atom format)
  out = out.replace(/:::mermaid\s*\{([^}]*)\}\s*:::/g, (_m, attrs) => {
    const codeMatch = attrs.match(/code=["']([^"']*)["']/);
    const c = codeMatch ? codeMatch[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<') : '';
    return `<div data-type="mermaid" data-code="${c.replace(/"/g, '&quot;').replace(/</g, '&lt;')}" class="mermaid-block"></div>`;
  });
  // :::mermaid\n```mermaid\ncode\n```\n::: (block format)
  out = out.replace(/:::mermaid\s*\n(?:```mermaid\n)?([\s\S]*?)(?:\n```)?\n:::/g, (_m, code) => {
    const c = code.trim().replace(/^```mermaid\n?|\n?```$/g, '');
    return `<div data-type="mermaid" data-code="${c.replace(/"/g, '&quot;').replace(/</g, '&lt;')}" class="mermaid-block"></div>`;
  });
  // @[label](resourceId)
  out = out.replace(/@\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, label, rid) => {
    return `<span data-type="resource-mention" data-resource-id="${rid}" data-title="${(label || '').replace(/"/g, '&quot;')}">${label || 'Resource'}</span>`;
  });
  return out;
}

/**
 * Convert string content to HTML for the editor. Use when content may come from AI (e.g. resource_update)
 * as Markdown or plain text. HTML is returned as-is. Markdown and plain text are converted to HTML.
 */
export function stringToEditorHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  if (looksLikeHtml(str)) return str;
  try {
    return markdownToHtml(str) !== str ? markdownToHtml(str) : (marked.parse(str) as string);
  } catch {
    return str;
  }
}

/**
 * Convert Markdown to HTML if the content appears to be Markdown.
 * Handles our custom ::: blocks and @[mention](id) syntax.
 */
export function markdownToHtml(content: string): string {
  if (!content || typeof content !== 'string') return content || '';
  if (looksLikeHtml(content)) return content;

  try {
    const preprocessed = preprocessCustomBlocks(content);
    const result = marked.parse(preprocessed);
    return typeof result === 'string' ? result : content;
  } catch {
    return content;
  }
}
