import type { Resource } from '@/types';
import { htmlToMarkdown, looksLikeMarkdown } from '@/lib/utils/markdown';

function tiptapJsonToMarkdown(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { type?: string; content?: unknown[] };
    if (!parsed || parsed.type !== 'doc' || !Array.isArray(parsed.content)) return null;
    const lines: string[] = [];
    type Node = { type?: string; text?: string; attrs?: { level?: number }; content?: Node[] };
    const walk = (node: Node): string => {
      if (node.type === 'text' && typeof node.text === 'string') return node.text;
      const children = Array.isArray(node.content) ? node.content : [];
      const inner = children.map((c) => walk(c)).join('');
      if (node.type === 'heading' && node.attrs?.level) {
        return `${'#'.repeat(Number(node.attrs.level) || 1)} ${inner}`;
      }
      if (node.type === 'paragraph') return inner;
      if (node.type === 'hardBreak') return '\n';
      return inner;
    };
    for (const block of parsed.content) {
      const line = walk(block as Node);
      if (line.trim()) lines.push(line);
    }
    return lines.join('\n\n');
  } catch {
    return null;
  }
}

/**
 * Load note body as markdown. The vault `.md` mirror is the source of truth;
 * legacy Tiptap JSON / bare markdown in `resources.content` is converted once.
 */
export async function loadNoteMarkdown(resource: Resource): Promise<string> {
  if (resource.vault_path && window.electron?.notes?.readMirror) {
    try {
      const mirror = await window.electron.notes.readMirror({ id: resource.id });
      if (mirror?.success && typeof mirror.markdown === 'string') {
        return mirror.markdown;
      }
    } catch (err) {
      console.warn('[loadNoteMarkdown] mirror read failed:', err);
    }
  }

  const raw = resource.content?.trim();
  if (!raw) return '';

  const fromJson = tiptapJsonToMarkdown(raw);
  if (fromJson) return fromJson;

  if (looksLikeMarkdown(raw)) return raw;

  if (raw.startsWith('<')) return htmlToMarkdown(raw);

  return raw;
}

export function countWordsFromMarkdown(markdown: string): number {
  const text = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_\[\]()!|`~-]/g, ' ');
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}
