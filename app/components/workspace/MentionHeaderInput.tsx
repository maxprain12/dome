import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
} from '@hugeicons/core-free-icons';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/types';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { showToast } from '@/lib/store/useToastStore';
import './mention-header-input.css';

type MenuItem =
  | { kind: 'tag'; id: string; label: string }
  | { kind: 'mention'; id: string; label: string; type: string }
  | { kind: 'person'; id: string; label: string; subtitle: string };

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
  const allTagsRef = useRef<Array<{ id: string; name: string; color?: string | null }>>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [committing, setCommitting] = useState(false);

  const token = useMemo(() => parseActiveToken(value, cursor), [value, cursor]);

  useEffect(() => {
    let cancelled = false;
    async function loadTags() {
      const activeProjectId = useAppStore.getState().currentProject?.id ?? 'default';
      const res = await window.electron.db.tags.getAll(activeProjectId);
      if (!cancelled && res.success && Array.isArray(res.data)) {
        allTagsRef.current = res.data.map((row) => ({ id: row.id, name: row.name, color: row.color }));
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

  const tokenKey = token ? `${token.kind}:${token.query}` : '';
  const prevTokenKeyRef = useRef(tokenKey);
  if (tokenKey !== prevTokenKeyRef.current) {
    prevTokenKeyRef.current = tokenKey;
    if (!token) {
      setItems([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    } else if (token.kind === 'tag') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const q = token.query.toLowerCase();
      const filtered: MenuItem[] = allTagsRef.current
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
    }
  }

  useEffect(() => {
    if (!token || token.kind === 'tag') return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const activeProjectId = useAppStore.getState().currentProject?.id ?? 'default';
        const [peopleRes, res] = await Promise.all([
          window.electron.people?.search?.({
            projectId: activeProjectId,
            query: token.query,
            limit: 8,
          }),
          window.electron.db.resources.searchForMention(token.query, activeProjectId),
        ]);
        const peopleRows =
          peopleRes?.success && Array.isArray(peopleRes.data?.people) ? peopleRes.data.people : [];
        const rows = (res.success && Array.isArray(res.data) ? res.data : []) as Resource[];
        const filtered: MenuItem[] = [];
        for (const person of peopleRows) {
          const identities = Array.isArray(person.identities) ? person.identities : [];
          const subtitle =
            identities
              .slice(0, 2)
              .map((i) => `${i.source}:${i.displayLabel || i.externalId}`)
              .join(' · ') || t('command.people');
          filtered.push({
            kind: 'person',
            id: person.id,
            label: person.displayName || person.primaryEmail || 'Person',
            subtitle,
          });
        }
        for (const r of rows) {
          if (r.id === resourceId) continue;
          filtered.push({
            kind: 'mention' as const,
            id: r.id,
            label: r.title || 'Untitled',
            type: r.type,
          });
        }
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
  }, [token, resourceId, updateMenuPosition, t]);

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

  const commitPerson = async (personId: string, label: string) => {
    setCommitting(true);
    try {
      try {
        const lookup = await window.electron.people?.get?.(personId);
        const person = lookup?.success ? lookup.data?.person : null;
        const identities = person?.identities || [];
        const hasEmail =
          identities.some((i) => i.source === 'email') || !!person?.primaryEmail;
        if (hasEmail) {
          useTabStore.getState().openEmailTab();
        } else if (identities.some((i) => i.source === 'github')) {
          useTabStore.getState().openGitHubTab();
        }
      } catch {
        /* ignore navigation errors */
      }
      setValue('');
      showToast('success', label);
    } finally {
      setCommitting(false);
    }
  };

  const handlePick = async (item: MenuItem) => {
    switch (item.kind) {
      case 'tag':
        await commitTag(item.label, item.id);
        break;
      case 'mention':
        await commitMention(item.id);
        break;
      case 'person':
        await commitPerson(item.id, item.label);
        break;
      default: {
        const _exhaustive: never = item;
        void _exhaustive;
      }
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
        className="mention-header-menu rounded-lg border shadow-lg overflow-hidden"
        style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
      >
        {loading ? (
          <div className="mention-header-loading px-3 py-2 text-xs">
            …
          </div>
        ) : (
          items.map((item, index) => {
            const isSel = index === selectedIndex;
            return (
              <button
                key={`${item.kind}-${item.id}-${item.label}`}
                type="button"
                className={`mention-header-menu-item w-full text-left px-3 py-2 text-sm transition-colors${isSel ? ' is-selected' : ''}`}
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
                  <span className="mention-header-item-type text-[11px] capitalize">
                    {item.type}
                  </span>
                ) : null}
                {item.kind === 'person' ? (
                  <span className="mention-header-item-type text-[11px]">
                    {item.subtitle}
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
    <div className="flex flex-col gap-y-2 shrink-0">
      <div ref={wrapRef} className="relative">
        <HugeiconsIcon icon={Search01Icon}
          size={14}
          className="mention-header-search-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
          className="mention-header-input w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={t('workspace.relations_input_aria')}
          autoComplete="off"
        />
        {menuPortal}
      </div>
    </div>
  );
}
