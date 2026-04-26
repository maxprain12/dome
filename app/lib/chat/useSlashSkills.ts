import { useCallback, useEffect, useRef, useState } from 'react';
import { listSkills } from '@/lib/skills/client';

export interface SlashSkillItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
  argument_hint?: string;
  arguments?: string[];
}

export interface UseSlashSkillsOptions {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** When false, / skill picker is disabled. */
  enabled?: boolean;
}

function isSlashTriggerPosition(textUpToCursor: string): { slashIdx: number; query: string } | null {
  let i = textUpToCursor.length - 1;
  while (i >= 0 && textUpToCursor[i] !== '/') {
    if (/\s/.test(textUpToCursor[i] ?? '')) return null;
    i--;
  }
  if (i < 0 || textUpToCursor[i] !== '/') return null;
  const before = i === 0 ? ' ' : textUpToCursor[i - 1];
  const validStart = i === 0 || /\s/.test(before ?? '');
  if (!validStart) return null;
  const query = textUpToCursor.slice(i + 1);
  if (query.includes('\n')) return null;
  return { slashIdx: i, query };
}

/**
 * /-command picker for file-based skills (SKILL.md), same source as Settings > Skills.
 */
export function useSlashSkills({
  input,
  setInput,
  inputRef,
  containerRef,
  enabled = true,
}: UseSlashSkillsOptions) {
  const [slashActive, setSlashActive] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIdx, setSlashIdx] = useState(-1);
  const [allSkills, setAllSkills] = useState<SlashSkillItem[]>([]);
  const [filteredSkills, setFilteredSkills] = useState<SlashSkillItem[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [slashRect, setSlashRect] = useState<{ top: number; left: number } | null>(null);
  const slashDropdownRef = useRef<HTMLDivElement>(null);

  const loadSkills = useCallback(async () => {
    try {
      const res = await listSkills({ includeBody: true });
      if (!res.success || !Array.isArray(res.data)) {
        setAllSkills([]);
        return;
      }
      const items: SlashSkillItem[] = res.data
        .filter(
          (s) => s.user_invocable !== false && !!(s as { body?: string }).body?.trim(),
        )
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          prompt: (s as { body?: string }).body || '',
          argument_hint: s.argument_hint,
          arguments: s.arguments,
        }))
        .filter((s) => s.id);
      setAllSkills(items);
    } catch {
      setAllSkills([]);
    }
  }, []);

  useEffect(() => {
    if (!slashActive) return;
    void loadSkills();
  }, [slashActive, loadSkills]);

  useEffect(() => {
    const q = slashQuery.trim().toLowerCase();
    if (!q) {
      setFilteredSkills(allSkills);
      return;
    }
    setFilteredSkills(
      allSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      ),
    );
  }, [allSkills, slashQuery]);

  useEffect(() => {
    setSlashSelectedIdx(0);
  }, [filteredSkills.length, slashQuery]);

  const updateFromText = useCallback(
    (val: string, cursor: number) => {
      if (!enabled) {
        setSlashActive(false);
        return;
      }
      const textUpToCursor = val.slice(0, cursor);
      const trig = isSlashTriggerPosition(textUpToCursor);
      if (trig) {
        setSlashQuery(trig.query);
        setSlashIdx(trig.slashIdx);
        setSlashActive(true);
        return;
      }
      setSlashActive(false);
    },
    [enabled],
  );

  const removeSlashTokenFromInput = useCallback(
    (cursor: number) => {
      const textUpToCursor = input.slice(0, cursor);
      const trig = isSlashTriggerPosition(textUpToCursor);
      if (!trig) return;
      const newInput = input.slice(0, trig.slashIdx) + input.slice(cursor);
      setInput(newInput);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          const pos = trig.slashIdx;
          inputRef.current.selectionStart = pos;
          inputRef.current.selectionEnd = pos;
          inputRef.current.focus();
        }
      });
    },
    [input, inputRef, setInput],
  );

  useEffect(() => {
    if (!slashActive || !containerRef.current) {
      setSlashRect(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setSlashRect({ top: rect.top, left: rect.left });
  }, [slashActive, containerRef]);

  useEffect(() => {
    if (!slashActive) return;
    const handler = (e: MouseEvent) => {
      if (slashDropdownRef.current && !slashDropdownRef.current.contains(e.target as Node)) {
        setSlashActive(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [slashActive]);

  const handleSlashKeyDown = useCallback(
    (e: React.KeyboardEvent): { handled: boolean; skill?: SlashSkillItem; sticky?: boolean } => {
      if (!slashActive) return { handled: false };
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIdx((i) => Math.min(i + 1, Math.max(filteredSkills.length - 1, 0)));
        return { handled: true };
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIdx((i) => Math.max(i - 1, 0));
        return { handled: true };
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredSkills[slashSelectedIdx];
        if (selected) {
          const cursor = inputRef.current?.selectionStart ?? input.length;
          removeSlashTokenFromInput(cursor);
          setSlashActive(false);
          return { handled: true, skill: selected, sticky: false };
        }
        return { handled: true };
      }
      if (e.key === 'Escape') {
        setSlashActive(false);
        return { handled: true };
      }
      return { handled: false };
    },
    [slashActive, filteredSkills, slashSelectedIdx, input.length, inputRef, removeSlashTokenFromInput],
  );

  return {
    slashActive,
    slashQuery,
    slashIdx,
    filteredSkills,
    slashSelectedIdx,
    setSlashSelectedIdx,
    slashRect,
    slashDropdownRef,
    updateFromText,
    removeSlashTokenFromInput,
    setSlashActive,
    handleSlashKeyDown,
  };
}
