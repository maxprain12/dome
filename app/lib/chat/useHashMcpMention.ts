import { useCallback, useEffect, useRef, useState } from 'react';
import { loadMcpServersSetting } from '@/lib/mcp/settings';

export interface HashMcpItem {
  name: string;
}

export interface UseHashMcpMentionOptions {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  enabled?: boolean;
}

function isHashTriggerPosition(textUpToCursor: string): { hashIdx: number; query: string } | null {
  let i = textUpToCursor.length - 1;
  while (i >= 0 && textUpToCursor[i] !== '#') {
    if (/\s/.test(textUpToCursor[i] ?? '')) return null;
    i--;
  }
  if (i < 0 || textUpToCursor[i] !== '#') return null;
  const before = i === 0 ? ' ' : textUpToCursor[i - 1];
  const validStart = i === 0 || /\s/.test(before ?? '');
  if (!validStart) return null;
  const query = textUpToCursor.slice(i + 1);
  if (query.includes('\n')) return null;
  return { hashIdx: i, query };
}

export function useHashMcpMention({
  input,
  setInput,
  inputRef,
  containerRef,
  enabled = true,
}: UseHashMcpMentionOptions) {
  const [hashActive, setHashActive] = useState(false);
  const [hashQuery, setHashQuery] = useState('');
  const [hashIdx, setHashIdx] = useState(-1);
  const [allServers, setAllServers] = useState<HashMcpItem[]>([]);
  const [filteredServers, setFilteredServers] = useState<HashMcpItem[]>([]);
  const [hashSelectedIdx, setHashSelectedIdx] = useState(0);
  const [hashRect, setHashRect] = useState<{ top: number; left: number } | null>(null);
  const hashDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hashActive) return;
    let cancelled = false;
    void loadMcpServersSetting().then((servers) => {
      if (cancelled) return;
      const items = servers
        .filter((s) => s.enabled !== false)
        .map((s) => ({ name: s.name }));
      setAllServers(items);
    });
    return () => {
      cancelled = true;
    };
  }, [hashActive]);

  useEffect(() => {
    const q = hashQuery.trim().toLowerCase();
    const next = q
      ? allServers.filter((s) => s.name.toLowerCase().includes(q))
      : allServers;
    setFilteredServers(next);
    setHashSelectedIdx(0);
  }, [allServers, hashQuery]);

  const updateFromText = useCallback(
    (val: string, cursor: number) => {
      if (!enabled) {
        setHashActive(false);
        return;
      }
      const trig = isHashTriggerPosition(val.slice(0, cursor));
      if (trig) {
        setHashQuery(trig.query);
        setHashIdx(trig.hashIdx);
        setHashActive(true);
        return;
      }
      setHashActive(false);
    },
    [enabled],
  );

  const insertHashServer = useCallback(
    (server: HashMcpItem) => {
      const cursor = inputRef.current?.selectionStart ?? input.length;
      const textUpToCursor = input.slice(0, cursor);
      const trig = isHashTriggerPosition(textUpToCursor);
      if (!trig) return;
      const slug = server.name.replace(/\s+/g, '-');
      const insertion = `#${slug} `;
      const newInput = input.slice(0, trig.hashIdx) + insertion + input.slice(cursor);
      setInput(newInput);
      const pos = trig.hashIdx + insertion.length;
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = pos;
          inputRef.current.selectionEnd = pos;
          inputRef.current.focus();
        }
      });
      setHashActive(false);
    },
    [input, inputRef, setInput],
  );

  const insertHashToken = useCallback(() => {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const after = input.slice(cursor);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const token = `${needsSpace ? ' ' : ''}#`;
    const next = `${before}${token}${after}`;
    setInput(next);
    const nextCursor = before.length + token.length;
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
      updateFromText(next, nextCursor);
    });
  }, [input, inputRef, setInput, updateFromText]);

  const [prevHashActive, setPrevHashActive] = useState(hashActive);
  if (hashActive !== prevHashActive) {
    setPrevHashActive(hashActive);
    if (!hashActive) setHashRect(null);
  }

  useEffect(() => {
    if (!hashActive || !containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setHashRect({ top: rect.top, left: rect.left });
  }, [hashActive, containerRef]);

  useEffect(() => {
    if (!hashActive) return;
    const handler = (e: MouseEvent) => {
      if (hashDropdownRef.current && !hashDropdownRef.current.contains(e.target as Node)) {
        setHashActive(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [hashActive]);

  const hashKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!hashActive) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHashSelectedIdx((i) => Math.min(i + 1, Math.max(filteredServers.length - 1, 0)));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHashSelectedIdx((i) => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredServers[hashSelectedIdx];
        if (selected) insertHashServer(selected);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setHashActive(false);
        return true;
      }
      return false;
    },
    [hashActive, filteredServers, hashSelectedIdx, insertHashServer],
  );

  return {
    hashActive,
    hashQuery,
    hashIdx,
    filteredServers,
    hashSelectedIdx,
    setHashSelectedIdx,
    hashRect,
    hashDropdownRef,
    updateFromText,
    insertHashServer,
    insertHashToken,
    hashKeyDown,
    setHashActive,
  };
}
