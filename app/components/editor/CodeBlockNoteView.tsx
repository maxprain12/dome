import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';

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
    (next: string) => {
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
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- contentEditable guard; the inner DomeSelectMenu owns all interaction.
          <div
            className="dome-code-block-view__lang"
            contentEditable={false}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <DomeSelectMenu
              value={lang}
              onChange={onLang}
              aria-label={t('notes.code_lang', 'Lenguaje')}
              fullWidth={false}
              options={LANG_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
            />
          </div>
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
