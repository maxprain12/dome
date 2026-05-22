import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

const LANG_OPTIONS = [
  'plaintext',
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'python',
  'bash',
  'json',
  'html',
  'css',
  'markdown',
];

export function CodeBlockNoteView(props: NodeViewProps) {
  const { editor, node, updateAttributes } = props;
  const { t } = useTranslation();
  const lang = typeof node.attrs.language === 'string' && node.attrs.language ? node.attrs.language : 'plaintext';
  const readonly = !editor.isEditable;
  const [copied, setCopied] = useState(false);

  const onLang = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.currentTarget.value;
      updateAttributes({ language: next });
    },
    [updateAttributes],
  );

  const onCopy = useCallback(() => {
    const src = typeof node?.textContent === 'string' ? node.textContent : '';
    void navigator.clipboard?.writeText(src).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [node?.textContent]);

  return (
    <NodeViewWrapper className="dome-code-block-view" style={{ margin: '1rem 0' }}>
      <div className="dome-code-block-view__toolbar">
        {!readonly ? (
          <select
            className="dome-code-block-view__lang"
            value={lang}
            aria-label={t('notes.code_lang', 'Lenguaje')}
            onChange={onLang}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {LANG_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <span className="dome-code-block-view__lang-ro">{lang}</span>
        )}
        <button
          type="button"
          className="dome-code-block-view__copy"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCopy}
          aria-label={t('notes.code_copy', 'Copiar código')}
          title={t('notes.code_copy', 'Copiar código')}
        >
          {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
        </button>
      </div>
      <pre className="dome-code-block-view__pre">
        <code className="dome-code-block-view__code">
          <NodeViewContent className="dome-code-block-view__inner" spellCheck={false} />
        </code>
      </pre>
    </NodeViewWrapper>
  );
}
