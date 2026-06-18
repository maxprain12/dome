import { useRef, useState, type CSSProperties } from 'react';

export interface Mentionable {
  login: string;
  avatar_url: string | null;
}

/**
 * A textarea with GitHub-style `@mention` autocomplete. When the user types `@`
 * followed by a partial login, a dropdown of matching users appears; selecting
 * one inserts `@login ` at the cursor.
 */
export default function MentionTextarea({
  value,
  onChange,
  users,
  rows = 4,
  placeholder,
  className,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  users: Mentionable[];
  rows?: number;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches =
    query == null
      ? []
      : users
          .filter((u) => u.login.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6);

  const detectMention = (text: string, caret: number) => {
    const upToCaret = text.slice(0, caret);
    // `@token` at the end, where token has no spaces and follows start/space.
    const m = /(^|\s)@([\w-]*)$/.exec(upToCaret);
    setQuery(m ? m[2] : null);
    setActive(0);
  };

  const insertMention = (login: string) => {
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
  };

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
      setQuery(null);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        rows={rows}
        placeholder={placeholder}
        className={className}
        style={style}
      />
      {query != null && matches.length > 0 && (
        <ul
          className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-auto rounded-md py-1 shadow-lg"
          style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
        >
          {matches.map((u, i) => (
            <li key={u.login}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(u.login);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                style={{
                  color: 'var(--dome-text)',
                  background: i === active ? 'var(--dome-bg-hover)' : 'transparent',
                }}
              >
                {u.avatar_url && (
                  <img src={u.avatar_url} alt="" className="size-5 rounded-full" style={{ border: '1px solid var(--dome-border)' }} />
                )}
                <span>@{u.login}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
