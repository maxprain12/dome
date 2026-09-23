import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { resolveEditorMediaSrc } from '@/lib/plugins/media';

/** Keep CMS media references in the document; resolve them only for display. */
function mediaImage(siteImages: () => Map<string, string> | undefined) {
  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement('img');
        let generation = 0;
        const render = (attrs: Record<string, unknown>) => {
          const current = ++generation;
          dom.alt = String(attrs.alt || '');
          dom.title = String(attrs.title || '');
          const src = String(attrs.src || '');
          dom.removeAttribute('src');
          void resolveEditorMediaSrc(src, siteImages()).then((resolved) => {
            if (current === generation) dom.src = resolved;
          }).catch(() => { /* Keep alt text visible when the media is unavailable. */ });
        };
        render(node.attrs);
        return {
          dom,
          update(next) {
            if (next.type !== node.type) return false;
            render(next.attrs);
            return true;
          },
          destroy() { generation += 1; },
        };
      };
    },
  }).configure({ allowBase64: true });
}

export function noteExtensions(
  placeholder: () => string = () => '',
  siteImages: () => Map<string, string> | undefined = () => undefined,
) {
  return [
    StarterKit.configure({
      underline: false,
      trailingNode: false,
      link: { openOnClick: false, protocols: ['dome'], autolink: false },
    }),
    Markdown.configure({ markedOptions: { gfm: true } }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    mediaImage(siteImages),
    Placeholder.configure({ placeholder }),
  ];
}

/** Syntax outside the visual schema remains editable verbatim in source mode. */
export function needsSourceEditor(markdown: string): boolean {
  const prose = markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
  return /<\/?[A-Za-z][^>]*>|<!--|^:::|^\[\^|\$[^$\n]+\$|^\$\$|^---\s*\n|^(?:import|export)\s|\{[^}\n]+\}/m.test(prose);
}
