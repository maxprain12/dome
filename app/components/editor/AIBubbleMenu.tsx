'use client';

import { useState, useCallback, useRef } from 'react';
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react';
import { Editor } from '@tiptap/core';
import {
  Sparkles,
  CheckCheck,
  Expand,
  FileText,
  Languages,
  Wand2,
  MessageSquare,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import {
  executeEditorAIAction,
  type EditorAIAction,
} from '@/lib/ai/editor-ai';
import { showPrompt } from '@/lib/store/usePromptStore';

interface AIBubbleMenuProps {
  editor: Editor;
}

interface AIPreview {
  original: string;
  result: string;
  from: number;
  to: number;
}

const AI_ACTIONS: Array<{
  id: EditorAIAction;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
  description: string;
}> = [
  { id: 'review', label: 'Review', icon: CheckCheck, description: 'Check grammar and style' },
  { id: 'improve', label: 'Improve', icon: Wand2, description: 'Improve writing quality' },
  { id: 'expand', label: 'Expand', icon: Expand, description: 'Add more detail' },
  { id: 'summarize', label: 'Summarize', icon: FileText, description: 'Summarize text' },
  { id: 'translate', label: 'Translate', icon: Languages, description: 'Translate text' },
  { id: 'custom', label: 'Ask Many', icon: MessageSquare, description: 'Custom AI prompt' },
];

export function AIBubbleMenu({ editor }: AIBubbleMenuProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [preview, setPreview] = useState<AIPreview | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleAction = useCallback(async (action: EditorAIAction) => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');

    if (!selectedText.trim()) return;

    // For custom action, get the prompt from user
    let customPrompt: string | undefined;
    if (action === 'custom') {
      const prompt = await showPrompt('What should Many do with this text?');
      if (!prompt) return;
      customPrompt = prompt;
    }

    setIsProcessing(true);
    setActiveAction(action);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const fullContent = editor.getText();
      const result = await executeEditorAIAction(
        action,
        selectedText,
        fullContent,
        customPrompt,
        abortController.signal,
      );

      // Show preview instead of directly replacing
      setPreview({
        original: selectedText,
        result,
        from,
        to,
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('AI action failed:', error);
      }
    } finally {
      setIsProcessing(false);
      setActiveAction(null);
      abortRef.current = null;
    }
  }, [editor]);

  const handleAccept = useCallback(() => {
    if (!preview) return;

    editor
      .chain()
      .focus()
      .setTextSelection({ from: preview.from, to: preview.to })
      .deleteSelection()
      .insertContent(preview.result)
      .run();

    setPreview(null);
  }, [editor, preview]);

  const handleReject = useCallback(() => {
    setPreview(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsProcessing(false);
    setActiveAction(null);
  }, []);

  if (!editor) return null;

  // Preview panel (shown outside bubble menu as a floating panel)
  if (preview) {
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);

    return (
      <div
        style={{
          position: 'fixed',
          left: `${Math.max(16, coords.left - 100)}px`,
          top: `${coords.bottom + 12}px`,
          maxWidth: '500px',
          width: '90vw',
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg, 8px)',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
          zIndex: 1001,
          animation: 'modal-appear 0.15s ease-out',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--primary-text)',
            }}
          >
            AI suggestion
          </span>
        </div>

        {/* Content */}
        <div style={{ padding: '12px 14px', maxHeight: '300px', overflowY: 'auto' }}>
          <div
            style={{
              fontSize: '13px',
              lineHeight: '1.6',
              color: 'var(--primary-text)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {preview.result}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '10px 14px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            onClick={handleReject}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md, 6px)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--secondary-text)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <X size={14} />
            Discard
          </button>
          <button
            onClick={handleAccept}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md, 6px)',
              border: 'none',
              background: 'var(--accent)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Check size={14} />
            Accept
          </button>
        </div>
      </div>
    );
  }

  return (
    <TiptapBubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 100,
        placement: 'bottom-start',
        offset: [0, 8],
      }}
      shouldShow={({ editor: e }) => {
        // Only show when there's a text selection and not in a code block
        const { from, to } = e.state.selection;
        return from !== to && !e.isActive('codeBlock');
      }}
      className="ai-bubble-menu"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md, 6px)',
          padding: '3px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
        }}
      >
        {/* AI label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            color: 'var(--accent)',
            fontSize: '11px',
            fontWeight: 600,
            borderRight: '1px solid var(--border)',
            marginRight: '2px',
          }}
        >
          <Sparkles size={12} />
          AI
        </div>

        {isProcessing ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
            }}
          >
            <Loader2 size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
              {activeAction === 'review' ? 'Reviewing...' :
               activeAction === 'improve' ? 'Improving...' :
               activeAction === 'expand' ? 'Expanding...' :
               activeAction === 'summarize' ? 'Summarizing...' :
               activeAction === 'translate' ? 'Translating...' :
               'Processing...'}
            </span>
            <button
              onClick={handleCancel}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: 'var(--tertiary-text)',
                display: 'flex',
              }}
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          AI_ACTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleAction(id)}
              title={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 8px',
                borderRadius: 'var(--radius-sm, 4px)',
                border: 'none',
                background: 'transparent',
                color: 'var(--secondary-text)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary-text)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--secondary-text)';
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))
        )}
      </div>
    </TiptapBubbleMenu>
  );
}
