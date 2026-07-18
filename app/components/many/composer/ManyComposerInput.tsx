import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  buildComposerHighlightSpans,
  buildComposerMirrorHtml,
  type ComposerTokenTooltip,
} from '@/lib/chat/composerInlineHighlight';
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
 * Uses a plain <textarea> (not the shared shadcn Textarea) so
 * `field-sizing-content` / `min-h-16` cannot inflate an empty island.
 * Empty → exact `rows * lineHeight`; with text → scrollHeight clamped.
 */

const FIELD_BASE =
  'box-border m-0 block w-full resize-none border-0 bg-transparent p-0 font-sans text-sm font-normal not-italic leading-5 tracking-normal [tab-size:8] whitespace-pre-wrap break-words [overflow-wrap:anywhere]';

const LINE_HEIGHT_PX = 20; // leading-5
const MAX_INPUT_HEIGHT = 180;

function syncMirrorScroll(textarea: HTMLTextAreaElement, mirror: HTMLDivElement | null) {
  if (!mirror) return;
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
}

function applyComposerHeight(el: HTMLTextAreaElement, height: number) {
  el.style.setProperty('field-sizing', 'fixed');
  el.style.minHeight = `${height}px`;
  el.style.height = `${height}px`;
  el.style.maxHeight = `${MAX_INPUT_HEIGHT}px`;
  el.style.overflowY = height >= MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
}

function measureComposerHeight(el: HTMLTextAreaElement, rows: number, value: string): number {
  const minH = Math.max(rows, 1) * LINE_HEIGHT_PX;
  // Empty must stay compact — never size to a wrapping placeholder.
  if (!value || value.length === 0) return minH;

  el.style.setProperty('field-sizing', 'fixed');
  el.style.minHeight = '0px';
  el.style.height = '0px';
  el.style.overflowY = 'hidden';
  const contentH = el.scrollHeight;
  return Math.min(Math.max(contentH, minH), MAX_INPUT_HEIGHT);
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
  const wrapRef = useRef<HTMLDivElement>(null);
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

  const autoGrow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const next = measureComposerHeight(el, rows, value);
    applyComposerHeight(el, next);
    const mirror = mirrorRef.current;
    if (mirror) {
      mirror.style.height = `${next}px`;
      syncMirrorScroll(el, mirror);
    }
  }, [inputRef, rows, value]);

  useLayoutEffect(() => {
    autoGrow();
  }, [autoGrow]);

  // Width changes (panel resize) can alter wrap metrics for multi-line content.
  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      autoGrow();
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [autoGrow]);

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

  const minH = Math.max(rows, 1) * LINE_HEIGHT_PX;

  return (
    <div
      ref={wrapRef}
      className="relative min-w-0 max-h-[180px]"
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
      <textarea
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
        style={
          {
            fieldSizing: 'fixed',
            height: minH,
            minHeight: minH,
            maxHeight: MAX_INPUT_HEIGHT,
            overflowY: 'hidden',
          } as CSSProperties
        }
        className={cn(
          FIELD_BASE,
          className,
          'relative z-1 min-h-0 text-transparent caret-foreground outline-none [-webkit-text-fill-color:transparent]',
          'placeholder:text-muted-foreground placeholder:[-webkit-text-fill-color:var(--muted-foreground)] placeholder:opacity-100',
          'disabled:cursor-not-allowed disabled:opacity-50',
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
