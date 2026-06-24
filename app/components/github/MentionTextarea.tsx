import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { AtSign } from 'lucide-react';
import { getCaretCoordinates } from '@/lib/dom/getCaretCoordinates';

export interface Mentionable {
  login: string;
  avatar_url: string | null;
}

interface PopupPos {
  top: number;
  left: number;
  /** Whether the popup is flipped above the caret. */
  flip: boolean;
}

const POPUP_MAX_HEIGHT = 240;
const POPUP_MIN_WIDTH = 240;
const POPUP_GAP = 4;
const VIEWPORT_PADDING = 8;
const BLUR_CLOSE_DELAY_MS = 120;

/**
 * A textarea with GitHub-style `@mention` autocomplete. When the user types
 * `@` followed by a partial login, a floating popup of matching users appears
 * — anchored to the caret position and portaled to `<body>` so it escapes any
 * `overflow: hidden` parent. Selecting one inserts `@login ` at the cursor.
 *
 * `featuredLogins` puts those users first in the dropdown — useful for the
 * current assignees and recent participants in the issue, so they surface
 * immediately when the user types `@`.
 */
export default function MentionTextarea({
  value,
  onChange,
  users,
  featuredLogins,
  rows = 4,
  placeholder,
  className,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  users: Mentionable[];
  featuredLogins?: string[];
  rows?: number;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<PopupPos | null>(null);
  const blurTimerRef = useRef<number | null>(null);

  const featuredSet = useMemo(() => {
    const s = new Set<string>();
    for (const l of featuredLogins ?? []) s.add(l.toLowerCase());
    return s;
  }, [featuredLogins]);

  const matches = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    const featured: Mentionable[] = [];
    const rest: Mentionable[] = [];
    for (const u of users) {
      if (!u.login.toLowerCase().includes(q)) continue;
      if (featuredSet.has(u.login.toLowerCase())) featured.push(u);
      else rest.push(u);
    }
    return [...featured, ...rest].slice(0, 6);
  }, [query, users, featuredSet]);

  const detectMention = useCallback((text: string, caret: number) => {
    const upToCaret = text.slice(0, caret);
    // `@token` at the end, where token has no spaces and follows start/space.
    const m = /(^|\s)@([\w-]*)$/.exec(upToCaret);
    setQuery(m ? m[2] : null);
    setActive(0);
  }, []);

  const insertMention = useCallback(
    (login: string) => {
      const el = ref.current;
      const caret = el?.selectionStart ?? value.length;
      const before = value.slice(0, caret);
      const after = value.slice(caret);
      const replaced = before.replace(/(^|\s)@([\w-]*)$/, `$1@${login} `);
      const next = replaced + after;
      onChange(next);
      setQuery(null);
      requestAnimationFrame(() => {
        el?.focus();
        const pos = replaced.length;
        el?.setSelectionRange(pos, pos);
      });
    },
    [onChange, value],
  );

  // Reposition the popup while it's open so it follows the caret.
  useLayoutEffect(() => {
    if (query == null || matches.length === 0) {
      setPos(null);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const target = ref.current;
      if (!target) return;
      const caretIndex = target.selectionStart ?? target.value.length;
      const caret = getCaretCoordinates(target, caretIndex);
      const rect = target.getBoundingClientRect();

      // Caret in viewport coords. Adjust for scroll/zoom so a `position:
      // fixed` popup lands in the right place even when scrolled.
      const caretViewportX = rect.left + caret.x - target.scrollLeft;
      const caretViewportY = rect.top + caret.y - target.scrollTop;

      const spaceBelow = window.innerHeight - (caretViewportY + caret.height);
      const spaceAbove = caretViewportY;
      const popupHeight = Math.min(POPUP_MAX_HEIGHT, matches.length * 32 + 8);
      const flip = spaceBelow < popupHeight + POPUP_GAP + VIEWPORT_PADDING
        && spaceAbove > spaceBelow;

      const width = Math.max(POPUP_MIN_WIDTH, rect.width);
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, caretViewportX),
        window.innerWidth - width - VIEWPORT_PADDING,
      );

      const top = flip
        ? Math.max(
            VIEWPORT_PADDING,
            caretViewportY - popupHeight - POPUP_GAP,
          )
        : Math.min(
            window.innerHeight - popupHeight - VIEWPORT_PADDING,
            caretViewportY + caret.height + POPUP_GAP,
          );

      setPos({ top, left, flip });
    };

    update();
    // Repaint twice — once after fonts settle, once more after any layout.
    const raf1 = requestAnimationFrame(() => {
      update();
      requestAnimationFrame(() => update());
    });

    const onScrollOrResize = () => update();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    el.addEventListener('scroll', onScrollOrResize);

    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      el.removeEventListener('scroll', onScrollOrResize);
    };
  }, [query, matches.length, value]);

  // Clear blur-close timer on unmount.
  useEffect(() => () => {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query == null || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(matches[active].login);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery(null);
      ref.current?.focus();
    }
  };

  const popup = pos ? (
    createPortal(
      <ul
        role="listbox"
        aria-label="Mention suggestions"
        className="dome-mention-popup"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          minWidth: POPUP_MIN_WIDTH,
          maxHeight: POPUP_MAX_HEIGHT,
        }}
        onMouseDown={(e) => {
          // Prevent the textarea from blurring before a click lands.
          e.preventDefault();
        }}
      >
        {matches.map((u, i) => {
          const isFeatured = featuredSet.has(u.login.toLowerCase());
          const isActive = i === active;
          return (
            <li key={u.login} role="option" aria-selected={isActive}>
              <button
                type="button"
                className={
                  'dome-mention-popup__item'
                  + (isActive ? ' dome-mention-popup__item--active' : '')
                }
                onMouseEnter={() => setActive(i)}
                onClick={(e) => {
                  e.preventDefault();
                  insertMention(u.login);
                }}
              >
                {u.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    className="dome-mention-popup__avatar"
                  />
                ) : (
                  <span className="dome-mention-popup__avatar-fallback">
                    {u.login.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="dome-mention-popup__login">@{u.login}</span>
                {isFeatured && (
                  <span className="dome-mention-popup__badge">
                    <AtSign size={9} />
                    assignee
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>,
      document.body,
    )
  ) : null;

  return (
    <>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => {
          const el = e.currentTarget;
          detectMention(el.value, el.selectionStart ?? el.value.length);
        }}
        onClick={(e) => {
          const el = e.currentTarget;
          detectMention(el.value, el.selectionStart ?? el.value.length);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Small delay so a click on a popup item still registers.
          if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
          blurTimerRef.current = window.setTimeout(() => {
            setQuery(null);
            blurTimerRef.current = null;
          }, BLUR_CLOSE_DELAY_MS);
        }}
        onFocus={() => {
          // If the user focuses back into an `@token`, re-open the popup.
          const el = ref.current;
          if (!el) return;
          detectMention(el.value, el.selectionStart ?? el.value.length);
        }}
        rows={rows}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Mention'}
        className={className}
        style={style}
      />
      {popup}
    </>
  );
}