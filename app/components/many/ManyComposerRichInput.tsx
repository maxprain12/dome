import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  buildComposerHighlightSpans,
  buildComposerMirrorHtml,
  type ComposerTokenTooltip,
} from '@/lib/chat/composerInlineHighlight';
import { AI_COMPOSER_INPUT_HANDLER } from '@/components/chat/AIComposer';

export interface ManyComposerRichInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInput?: React.FormEventHandler<HTMLTextAreaElement>;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
  inputRef: RefObject<HTMLTextAreaElement>;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  style?: CSSProperties;
  mentionLabels?: string[];
  skillLabels?: string[];
  fileNames?: string[];
  tokenTooltips?: Record<string, ComposerTokenTooltip>;
}

function syncMirrorScroll(textarea: HTMLTextAreaElement, mirror: HTMLDivElement | null) {
  if (!mirror) return;
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
}

export default memo(function ManyComposerRichInput({
  value,
  onChange,
  onKeyDown,
  onInput,
  onPaste,
  inputRef,
  placeholder,
  disabled,
  rows = 1,
  style,
  mentionLabels = [],
  skillLabels = [],
  fileNames = [],
  tokenTooltips = {},
}: ManyComposerRichInputProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    description: string;
  } | null>(null);

  const spans = useMemo(
    () =>
      buildComposerHighlightSpans(value, {
        mentionLabels,
        skillLabels,
        fileNames,
      }),
    [value, mentionLabels, skillLabels, fileNames],
  );

  const mirrorHtml = useMemo(() => buildComposerMirrorHtml(value, spans), [value, spans]);

  useEffect(() => {
    const el = inputRef.current;
    if (el) syncMirrorScroll(el, mirrorRef.current);
  }, [value, inputRef]);

  const clearTooltip = useCallback(() => setTooltip(null), []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    syncMirrorScroll(e.currentTarget, mirrorRef.current);
  }, []);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      (onInput ?? AI_COMPOSER_INPUT_HANDLER)(e);
      syncMirrorScroll(e.currentTarget, mirrorRef.current);
    },
    [onInput],
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const mirror = mirrorRef.current;
      if (!mirror) return;
      const nodes = mirror.querySelectorAll<HTMLElement>('[data-token-key]');
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          const key = node.dataset.tokenKey;
          const meta = key ? tokenTooltips[key] : undefined;
          if (meta) {
            setTooltip({
              x: rect.left + rect.width / 2,
              y: rect.top,
              title: meta.title,
              description: meta.description,
            });
            return;
          }
        }
      }
      setTooltip(null);
    },
    [tokenTooltips],
  );

  return (
    <div
      className="many-composer-rich-input"
      onMouseMove={handlePointerMove}
      onMouseLeave={clearTooltip}
    >
      <div
        ref={mirrorRef}
        className="many-composer-rich-input__mirror"
        aria-hidden
        style={style}
        dangerouslySetInnerHTML={{ __html: mirrorHtml }}
      />
      <textarea
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onScroll={handleScroll}
        onInput={handleInput}
        onPaste={onPaste}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className="many-composer-rich-input__field focus:outline-none focus:ring-0 disabled:opacity-50"
        style={style}
        spellCheck
      />
      {tooltip && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="composer-token-tooltip"
              style={{
                left: tooltip.x,
                top: tooltip.y,
              }}
              role="tooltip"
            >
              <p className="composer-token-tooltip__title">{tooltip.title}</p>
              <p className="composer-token-tooltip__desc">{tooltip.description}</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});
