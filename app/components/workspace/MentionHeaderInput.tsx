import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { Resource } from '@/types';

type MenuItem =
  | { kind: 'tag'; id: string; label: string }
  | { kind: 'mention'; id: string; label: string; type: string };

function parseActiveToken(
  value: string,
  cursor: number,
): { kind: 'tag' | 'mention'; query: string } | null {
  const left = value.slice(0, cursor);
  const tagM = left.match(/#([\w./-]*)$/u);
  if (tagM) return { kind: 'tag', query: tagM[1] ?? '' };
  const menM = left.match(/@([^\s@#]*)$/);
  if (menM) return { kind: 'mention', query: menM[1] ?? '' };
  return null;
}

function isLikelyUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\/.+/i.test(t);
}

interface MentionHeaderInputProps {
  resourceId: string;
  onLinked: () => void | Promise<void>;
  onTagged: () => void | Promise<void>;
}

export default function MentionHeaderInput({
  resourceId,
  onLinked,
  onTagged,
}: MentionHeaderInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; color?: string | null }>>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [committing, setCommitting] = useState(false);

  const token = useMemo(() => parseActiveToken(value, cursor), [value, cursor]);

  useEffect(() => {
    let cancelled = false;
    async function loadTags() {
      const res = await window.electron.db.tags.getAll();
      if (!cancelled && res.success && Array.isArray(res.data)) {
        setAllTags(res.data.map((row) => ({ id: row.id, name: row.name, color: row.color })));
      }
    }
    loadTags();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateMenuPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 6,
      left: Math.min(r.left, window.innerWidth - 280),
      width: Math.min(r.width, 280),
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setItems([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    if (token.kind === 'tag') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const q = token.query.toLowerCase();
      const filtered: MenuItem[] = allTags
        .filter((tag) => tag.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map((tag) => ({ kind: 'tag' as const, id: tag.id, label: tag.name }));
      if (
        q.length > 0 &&
        !filtered.some((f) => f.label.toLowerCase() === q) &&
        /^[\w./-]+$/u.test(token.query)
      ) {
        filtered.push({
          kind: 'tag',
          id: '__create__',
          label: token.query,
        });
      }
      setItems(filtered);
      setSelectedIndex(0);
      updateMenuPosition();
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await window.electron.db.resources.searchForMention(token.query);
        const rows = (res.success && Array.isArray(res.data) ? res.data : []) as Resource[];
        const filtered = rows
          .filter((r) => r.id !== resourceId)
          .map((r) => ({
            kind: 'mention' as const,
            id: r.id,
            label: r.title || 'Untitled',
            type: r.type,
          }));
        setItems(filtered);
        setSelectedIndex(0);
      } finally {
        setLoading(false);
      }
      updateMenuPosition();
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token, allTags, resourceId, updateMenuPosition]);

  useEffect(() => {
    updateMenuPosition();
  }, [value, token, updateMenuPosition]);

  const commitTag = async (name: string, existingId?: string) => {
    setCommitting(true);
    try {
      let tagId = existingId;
      if (!tagId || existingId === '__create__') {
        const created = await window.electron.db.tags.create({ name: name.replace(/^#+/u, '').trim() });
        if (!created.success || !created.data) return;
        tagId = created.data.id;
      }
      await window.electron.db.tags.addToResource(resourceId, tagId!);
      setValue('');
      await onTagged();
    } finally {
      setCommitting(false);
    }
  };

  const commitMention = async (targetId: string) => {
    setCommitting(true);
    try {
      const res = await window.electron.db.semantic.createManual({
        sourceId: resourceId,
        targetId,
        label: null,
      });
      if (!res.success) return;
      setValue('');
      await onLinked();
    } finally {
      setCommitting(false);
    }
  };

  const commitUrl = async (rawUrl: string) => {
    setCommitting(true);
    try {
      const ensured = await window.electron.db.resources.ensureUrl({
        url: rawUrl.trim(),
        sourceResourceId: resourceId,
      });
      if (!ensured.success || !ensured.data) return;
      const target = ensured.data;
      const res = await window.electron.db.semantic.createManual({
        sourceId: resourceId,
        targetId: target.id,
        label: null,
      });
      if (!res.success) return;
      setValue('');
      await onLinked();
    } finally {
      setCommitting(false);
    }
  };

  const handlePick = async (item: MenuItem) => {
    if (item.kind === 'tag') {
      await commitTag(item.label, item.id);
    } else {
      await commitMention(item.id);
    }
  };

  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (token && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item) await handlePick(item);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setValue((v) => v.replace(/#[\w./-]*$/u, '').replace(/@[^\s@#]*$/u, ''));
        return;
      }
    }

    if (e.key === 'Enter' && !token && isLikelyUrl(value)) {
      e.preventDefault();
      await commitUrl(value);
    }
  };

  const showMenu = Boolean(token && items.length > 0);

  const menuPortal =
    showMenu &&
    createPortal(
      <div
        className="rounded-lg border shadow-lg overflow-hidden"
        style={{
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          zIndex: 10000,
          background: 'var(--dome-surface)',
          borderColor: 'var(--dome-border)',
          maxHeight: 240,
          overflowY: 'auto',
        }}
      >
        {loading ? (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            …
          </div>
        ) : (
          items.map((item, index) => {
            const isSel = index === selectedIndex;
            return (
              <button
                key={`${item.kind}-${item.id}-${item.label}`}
                type="button"
                className="w-full text-left px-3 py-2 text-sm transition-colors"
                style={{
                  background: isSel ? 'var(--dome-bg-hover)' : 'transparent',
                  color: 'var(--dome-text)',
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => void handlePick(item)}
              >
                <span className="font-medium block truncate">
                  {item.kind === 'tag' && item.id === '__create__'
                    ? `${t('workspace.relations_create_tag')}: #${item.label}`
                    : item.kind === 'tag'
                      ? `#${item.label}`
                      : item.label}
                </span>
                {item.kind === 'mention' ? (
                  <span className="text-[11px] capitalize" style={{ color: 'var(--dome-text-muted)' }}>
                    {item.type}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>,
      document.body,
    );

  return (
    <div className="space-y-2 shrink-0">
      <div ref={wrapRef} className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--dome-text-muted)' }}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={committing}
          onChange={(e) => {
            setValue(e.target.value);
            setCursor(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) => {
            const tgt = e.target as HTMLInputElement;
            setCursor(tgt.selectionStart ?? tgt.value.length);
          }}
          onKeyDown={(e) => void onKeyDown(e)}
          placeholder={t('workspace.relations_placeholder')}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2"
          style={{
            background: 'var(--dome-surface)',
            border: '1px solid var(--dome-border)',
            color: 'var(--dome-text)',
          }}
          aria-label={t('workspace.relations_input_aria')}
          autoComplete="off"
        />
        {menuPortal}
      </div>
    </div>
  );
}
