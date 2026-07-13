import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  buildComposerHighlightSpans,
  buildComposerMirrorHtml,
  type ComposerTokenTooltip,
} from '@/lib/chat/composerInlineHighlight';
import { AI_COMPOSER_INPUT_HANDLER } from '@/components/chat/AIComposer';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';

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
  mentionLabels?: string[];
  skillLabels?: string[];
  fileNames?: string[];
  tokenTooltips?: Record<string, ComposerTokenTooltip>;
  className?: string;
}

const FIELD_BASE =
  'box-border m-0 w-full resize-none border-0 bg-transparent font-inherit text-sm font-normal not-italic tracking-normal [tab-size:8] whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-[1.55]';

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
  mentionLabels = [],
  skillLabels = [],
  fileNames = [],
  tokenTooltips = {},
  className,
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
      className={cn('relative min-w-0', className)}
      onMouseMove={handlePointerMove}
      onMouseLeave={clearTooltip}
    >
      <div
        ref={mirrorRef}
        className={cn(
          FIELD_BASE,
          className,
          'pointer-events-none absolute inset-0 z-0 overflow-hidden text-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: mirrorHtml }}
      />
      <Textarea
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onScroll={handleScroll}
        onInput={handleInput}
        onPaste={onPaste}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Message'}
        disabled={disabled}
        rows={rows}
        data-slot="input-group-control"
        className={cn(
          FIELD_BASE,
          className,
          'relative z-1 block text-transparent caret-foreground [-webkit-text-fill-color:transparent] focus:outline-none focus:ring-0 disabled:opacity-50',
          'placeholder:text-muted-foreground placeholder:[-webkit-text-fill-color:var(--muted-foreground)] placeholder:opacity-100',
        )}
      />
      {tooltip && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[var(--z-popover)] max-w-[260px] -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg border bg-background px-2.5 py-2 shadow-md"
              style={{
                left: tooltip.x,
                top: tooltip.y,
              }}
              role="tooltip"
            >
              <p className="mb-0.5 text-xs font-semibold leading-snug text-foreground">{tooltip.title}</p>
              <p className="m-0 text-[11px] leading-snug text-muted-foreground">{tooltip.description}</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});
