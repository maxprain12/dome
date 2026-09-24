import { Extension } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import type { JSONContent } from '@tiptap/core';
import type { NoteExtensionContext } from './types';

const katexOptions = { throwOnError: false as const };

function blockMarkdown(node: JSONContent): string {
  const latex = String(node.attrs?.latex ?? '');
  if (!latex) return '';
  return latex.includes('\n') ? `$$\n${latex}\n$$` : `$$${latex}$$`;
}

/** KaTeX math from `@tiptap/extension-mathematics`, with single-line `$$` round-trips. */
export function mathematicsExtension(ctx: NoteExtensionContext) {
  const block = BlockMath.extend({
    renderMarkdown: blockMarkdown,
  }).configure({
    katexOptions: { ...katexOptions, displayMode: true },
    onClick: (node, pos) => ctx.openMath({ latex: String(node.attrs.latex ?? ''), pos, kind: 'block' }),
  });
  const inline = InlineMath.configure({
    katexOptions,
    onClick: (node, pos) => ctx.openMath({ latex: String(node.attrs.latex ?? ''), pos, kind: 'inline' }),
  });
  return Extension.create({
    name: 'mathematics',
    addExtensions() {
      return [block, inline];
    },
  });
}
