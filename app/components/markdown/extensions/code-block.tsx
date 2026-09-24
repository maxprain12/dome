import { common, createLowlight } from 'lowlight';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { useTranslation } from 'react-i18next';

const lowlight = createLowlight(common);
const languages = lowlight.listLanguages().slice().sort((a, b) => a.localeCompare(b));

function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const language = String(node.attrs.language || '');
  return (
    <NodeViewWrapper className="note-code-block">
      {editor.isEditable ? (
        <select
          className="note-code-lang"
          contentEditable={false}
          aria-label={t('notes.code_lang')}
          value={language}
          onChange={(event) => updateAttributes({ language: event.target.value || null })}
        >
          <option value="">{t('notes.code_plain')}</option>
          {languages.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      ) : null}
      <pre><code><NodeViewContent /></code></pre>
    </NodeViewWrapper>
  );
}

export function codeBlockExtension() {
  return CodeBlockLowlight.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView);
    },
  }).configure({ lowlight });
}
