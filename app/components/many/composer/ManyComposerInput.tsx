import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  buildComposerHighlightSpans,
  buildComposerMirrorHtml,
  type ComposerTokenTooltip,
} from '@/lib/chat/composerInlineHighlight';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface ManyComposerInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
  inputRef: RefObject<HTMLTextAreaElement>;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  mentionLabels?: string[];
  skillLabels?: string[];
  fileNames?: string[];
  tokenTooltips?: Record<string, ComposerTokenTooltip>;
  className?: string;
}

/**
 * Composer text field with inline token highlighting: a transparent textarea
 * over a mirror div that paints @doc, /skill and #mcp tokens, plus hover
 * tooltips for each token.
 *
 * Mirror + textarea must share the same box model (padding, font, line-height)
 * or the caret drifts relative to the painted glyphs.
 */

const FIELD_BASE =
  'box-border m-0 block w-full resize-none border-0 bg-transparent p-0 font-sans text-sm font-normal not-italic leading-5 tracking-normal [tab-size:8] whitespace-pre-wrap break-words [overflow-wrap:anywhere]';

const FIELD_RESET =
  'min-h-0 rounded-none px-0 py-0 shadow-none ring-0 outline-none focus-visible:border-0 focus-visible:ring-0 md:text-sm field-sizing-fixed';

const MAX_INPUT_HEIGHT = 180;

function syncMirrorScroll(textarea: HTMLTextAreaElement, mirror: HTMLDivElement | null) {
  if (!mirror) return;
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
}

export default memo(function ManyComposerInput({
  value,
  onChange,
  onKeyDown,
  onPaste,
  inputRef,
  placeholder,
  disabled,
  rows = 1,
  mentionLabels = [],
  skillLabels = [],
  fileNames = [],
  tokenTooltips = {},
  className,
}: ManyComposerInputProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    description: string;
  } | null>(null);

  const spans = useMemo(
    () => buildComposerHighlightSpans(value, { mentionLabels, skillLabels, fileNames }),
    [value, mentionLabels, skillLabels, fileNames],
  );

  const mirrorHtml = useMemo(() => buildComposerMirrorHtml(value, spans), [value, spans]);

  const autoGrow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    autoGrow(el);
    const mirror = mirrorRef.current;
    if (mirror) {
      mirror.style.height = el.style.height;
      syncMirrorScroll(el, mirror);
    }
  }, [value, inputRef, autoGrow]);

  const clearTooltip = useCallback(() => setTooltip(null), []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    syncMirrorScroll(e.currentTarget, mirrorRef.current);
  }, []);

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
      className="relative min-w-0"
      onMouseMove={handlePointerMove}
      onMouseLeave={clearTooltip}
    >
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          FIELD_BASE,
          className,
          'pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden text-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
        dangerouslySetInnerHTML={{ __html: mirrorHtml }}
      />
      <Textarea
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onScroll={handleScroll}
        onPaste={onPaste}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Message'}
        disabled={disabled}
        rows={rows}
        data-slot="input-group-control"
        className={cn(
          FIELD_BASE,
          FIELD_RESET,
          className,
          'relative z-1 text-transparent caret-foreground [-webkit-text-fill-color:transparent] disabled:opacity-50',
          'placeholder:text-muted-foreground placeholder:[-webkit-text-fill-color:var(--muted-foreground)] placeholder:opacity-100',
        )}
      />
      {tooltip && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="tooltip"
              data-slot="tooltip-content"
              className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <p className="font-medium leading-snug">{tooltip.title}</p>
              <p className="mt-0.5 text-[0.6875rem] leading-snug opacity-80">{tooltip.description}</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});
