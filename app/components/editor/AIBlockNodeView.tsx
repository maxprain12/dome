import { useCallback, type ChangeEvent } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { executeEditorAIAction } from '@/lib/ai/editor-ai';
import type { AIBlockStatus } from '@/lib/tiptap/extensions/ai-block';
import { stringToEditorHtml } from '@/lib/utils/markdown';

function safeStatus(value: unknown): AIBlockStatus {
  if (value === 'running' || value === 'done' || value === 'error' || value === 'idle') {
    return value;
  }
  return 'idle';
}

export function AIBlockNodeView({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  const { t } = useTranslation();
  const prompt = typeof node.attrs.prompt === 'string' ? node.attrs.prompt : '';
  const response = typeof node.attrs.response === 'string' ? node.attrs.response : '';
  const status = safeStatus(node.attrs.status);

  const onPromptChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      updateAttributes({ prompt: e.target.value });
    },
    [updateAttributes],
  );

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    updateAttributes({ prompt: trimmed, status: 'running' });
    try {
      const documentText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n\n');
      const result = await executeEditorAIAction('custom', trimmed, documentText, trimmed);
      updateAttributes({ response: result, status: 'done' });
    } catch (err) {
      updateAttributes({
        response: err instanceof Error ? err.message : t('focused_editor.ai_block_generate_error'),
        status: 'error',
      });
    }
  }, [editor, prompt, updateAttributes, t]);

  const handleInsert = useCallback(() => {
    if (!response.trim()) return;
    const pos = getPos();
    if (pos === undefined) return;
    const blockNode = editor.state.doc.nodeAt(pos);
    if (!blockNode || blockNode.type.name !== 'aiBlock') return;
    const html = stringToEditorHtml(response);
    if (!html) return;
    editor.chain().focus().insertContentAt(pos + blockNode.nodeSize, html).run();
  }, [editor, getPos, response]);

  const handleReplace = useCallback(() => {
    if (!response.trim()) return;
    const pos = getPos();
    if (pos === undefined) return;
    const blockNode = editor.state.doc.nodeAt(pos);
    if (!blockNode || blockNode.type.name !== 'aiBlock') return;
    const html = stringToEditorHtml(response);
    if (!html) return;
    editor.chain().focus().insertContentAt({ from: pos, to: pos + blockNode.nodeSize }, html).run();
  }, [editor, getPos, response]);

  const isRunning = status === 'running';
  const showResponse = response.length > 0;
  const emptyHint =
    status === 'running'
      ? t('focused_editor.ai_block_generating')
      : t('focused_editor.ai_block_empty_response');

  return (
    <NodeViewWrapper className="dome-ai-block" data-type="ai-block">
      <div className="dome-ai-block__eyebrow">{t('focused_editor.ai_block_label')}</div>
      <textarea
        className="dome-ai-block__prompt-input"
        value={prompt}
        onChange={onPromptChange}
        placeholder={t('focused_editor.ai_block_prompt_placeholder')}
        rows={3}
        disabled={isRunning}
        aria-label={t('focused_editor.ai_block_prompt_aria')}
      />
      {showResponse ? (
        <div className="dome-ai-block__response">{response}</div>
      ) : (
        <div className="dome-ai-block__empty">{emptyHint}</div>
      )}
      <div className="dome-ai-block__actions">
        <button
          type="button"
          className="dome-ai-block-generate"
          onClick={() => void handleGenerate()}
          disabled={isRunning || !prompt.trim()}
        >
          {isRunning ? t('focused_editor.ai_block_generating') : t('focused_editor.ai_block_generate')}
        </button>
        <button type="button" className="dome-ai-block-insert" onClick={handleInsert} disabled={!response.trim()}>
          {t('focused_editor.ai_block_insert')}
        </button>
        <button type="button" className="dome-ai-block-replace" onClick={handleReplace} disabled={!response.trim()}>
          {t('focused_editor.ai_block_replace')}
        </button>
      </div>
    </NodeViewWrapper>
  );
}
