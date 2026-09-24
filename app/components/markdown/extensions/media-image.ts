import Image from '@tiptap/extension-image';
import { resolveEditorMediaSrc } from '@/lib/plugins/media';

/** Keep CMS media references in the document; resolve them only for display. */
export function mediaImage(
  siteImages: () => Map<string, string> | undefined,
  siteUrl: () => string | undefined,
  refreshers?: Set<() => void>,
) {
  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement('img');
        let generation = 0;
        let attributes = node.attrs;
        const render = (attrs: Record<string, unknown>) => {
          const current = ++generation;
          dom.alt = String(attrs.alt || '');
          dom.title = String(attrs.title || '');
          const src = String(attrs.src || '');
          dom.removeAttribute('src');
          resolveEditorMediaSrc(src, siteImages(), siteUrl()).then((resolved) => {
            if (current === generation) dom.src = resolved;
          }).catch(() => { /* Keep alt text visible when the media is unavailable. */ });
        };
        const refresh = () => render(attributes);
        refreshers?.add(refresh);
        refresh();
        return {
          dom,
          update(next) {
            if (next.type !== node.type) return false;
            attributes = next.attrs;
            refresh();
            return true;
          },
          destroy() { generation += 1; refreshers?.delete(refresh); },
        };
      };
    },
  }).configure({ allowBase64: true });
}
