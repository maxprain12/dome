'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Settings,
  AlertCircle,
} from 'lucide-react';
import {
  executeEditorAIActionStreaming,
  type EditorAIAction,
} from '@/lib/ai/editor-ai';
import { showPrompt } from '@/lib/store/usePromptStore';
import { showToast } from '@/lib/store/useToastStore';

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

/**
 * Preview panel rendered via portal to document.body.
 * Must be completely outside the React tree that contains TiptapBubbleMenu
 * to avoid DOM conflicts with Tippy.js portal management.
 */
function AIPreviewPanel({
  preview,
  isProcessing,
  onAccept,
  onReject,
  editor,
}: {
  preview: AIPreview;
  isProcessing: boolean;
  onAccept: () => void;
  onReject: () => void;
  editor: Editor;
}) {
  const coords = editor.view.coordsAtPos(preview.from);

  return createPortal(
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
            flex: 1,
          }}
        >
          AI suggestion
        </span>
        {isProcessing && (
          <Loader2 size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
        )}
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
          {isProcessing && (
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 14,
                backgroundColor: 'var(--accent)',
                marginLeft: 2,
                animation: 'blink 1s step-end infinite',
                verticalAlign: 'text-bottom',
              }}
            />
          )}
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
          onClick={onReject}
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
          onClick={onAccept}
          disabled={isProcessing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md, 6px)',
            border: 'none',
            background: isProcessing ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: isProcessing ? 'var(--tertiary-text)' : '#ffffff',
            fontSize: '12px',
            fontWeight: 500,
            cursor: isProcessing ? 'not-allowed' : 'pointer',
          }}
        >
          <Check size={14} />
          Accept
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function AIBubbleMenu({ editor }: AIBubbleMenuProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [preview, setPreview] = useState<AIPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Ref to avoid stale closures in shouldShow callback
  // Tiptap captures shouldShow at plugin registration time, so we need a ref
  const previewRef = useRef<AIPreview | null>(null);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  // Inject keyframe animations once
  useEffect(() => {
    const id = 'ai-bubble-menu-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `@keyframes blink { 50% { opacity: 0; } }`;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

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
    setErrorMessage(null);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const fullContent = editor.getText();

      // Use streaming version for real-time preview
      const result = await executeEditorAIActionStreaming(
        action,
        selectedText,
        fullContent,
        (partialResult) => {
          setPreview({
            original: selectedText,
            result: partialResult,
            from,
            to,
          });
        },
        customPrompt,
        abortController.signal,
      );

      // Set final result
      setPreview({
        original: selectedText,
        result,
        from,
        to,
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        const msg = error instanceof Error ? error.message : 'Unknown AI error';
        setErrorMessage(msg);
        showToast('error', `AI: ${msg}`);
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

  const handleGoToSettings = useCallback(() => {
    setErrorMessage(null);
    if (typeof window !== 'undefined' && window.electron?.openSettings) {
      window.electron.openSettings();
    }
  }, []);

  if (!editor) return null;

  return (
    <>
      {/* Preview panel — rendered via portal to document.body, completely outside this React tree */}
      {preview && (
        <AIPreviewPanel
          preview={preview}
          isProcessing={isProcessing}
          onAccept={handleAccept}
          onReject={handleReject}
          editor={editor}
        />
      )}

      {/* TiptapBubbleMenu — ALWAYS mounted, hidden via shouldShow when preview is active */}
      <TiptapBubbleMenu
        editor={editor}
        pluginKey="aiBubbleMenu"
        tippyOptions={{
          duration: 100,
          placement: 'bottom-start',
          offset: [0, 8],
          maxWidth: 'none',
        }}
        shouldShow={({ editor: e }) => {
          // Hide when preview is active (use ref to avoid stale closure)
          if (previewRef.current) return false;
          // Only show when there's a text selection and not in a code block
          const { from, to } = e.state.selection;
          return from !== to && !e.isActive('codeBlock');
        }}
        className="ai-bubble-menu"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 6px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
          }}
        >
          {/* Error banner */}
          {errorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border)',
                borderRadius: 'var(--radius-md, 6px) var(--radius-md, 6px) 0 0',
              }}
            >
              <AlertCircle size={13} style={{ color: 'var(--error)', flexShrink: 0 }} />
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--error)',
                  flex: 1,
                  lineHeight: '1.3',
                }}
              >
                {errorMessage}
              </span>
              <button
                onClick={handleGoToSettings}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--accent)',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <Settings size={10} />
                Settings
              </button>
              <button
                onClick={() => setErrorMessage(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--tertiary-text)',
                  padding: '2px',
                  display: 'flex',
                  flexShrink: 0,
                }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '3px',
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
                flexShrink: 0,
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
                    flexShrink: 0,
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
        </div>
      </TiptapBubbleMenu>
    </>
  );
}
