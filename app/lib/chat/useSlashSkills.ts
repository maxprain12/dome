import { useCallback, useEffect, useRef, useState } from 'react';
import { listSkills } from '@/lib/skills/client';

export interface SlashSkillItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export interface UseSlashSkillsOptions {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** When false, / skill picker is disabled. */
  enabled?: boolean;
  /** Preloaded catalog (browser extension). When set, skips Electron `skills:list`. */
  catalog?: SlashSkillItem[];
  /** Commands shown above skills (`/plan`, `/draft`, `/agent`). */
  prefixItems?: SlashSkillItem[];
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
const EMPTY_SLASH_ITEMS: SlashSkillItem[] = [];

export function useSlashSkills({
  input,
  setInput,
  inputRef,
  containerRef,
  enabled = true,
  catalog,
  prefixItems = EMPTY_SLASH_ITEMS,
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
      const res = await listSkills();
      if (!res.success || !Array.isArray(res.data)) {
        setAllSkills([]);
        return;
      }
      const items: SlashSkillItem[] = res.data
        .filter((s) => !!s.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          prompt: '',
        }));
      setAllSkills(items);
    } catch {
      setAllSkills([]);
    }
  }, []);

  useEffect(() => {
    if (catalog) {
      setAllSkills(catalog);
      return;
    }
    if (!slashActive) return;
    void loadSkills();
  }, [catalog, slashActive, loadSkills]);

  useEffect(() => {
    const q = slashQuery.trim().toLowerCase();
    const matches = (item: SlashSkillItem) => {
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    };
    const prefix = prefixItems.filter(matches);
    const skills = !q
      ? allSkills
      : allSkills.filter(matches);
    setFilteredSkills([...prefix, ...skills]);
  }, [allSkills, slashQuery, prefixItems]);

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

  const insertSlashSkill = useCallback(
    (skill: SlashSkillItem) => {
      const cursor = inputRef.current?.selectionStart ?? input.length;
      const textUpToCursor = input.slice(0, cursor);
      const trig = isSlashTriggerPosition(textUpToCursor);
      const insertion = `/${skill.name} `;
      const newInput = trig
        ? input.slice(0, trig.slashIdx) + insertion + input.slice(cursor)
        : input.slice(0, cursor) + insertion + input.slice(cursor);
      setInput(newInput);
      const pos = (trig ? trig.slashIdx : cursor) + insertion.length;
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = pos;
          inputRef.current.selectionEnd = pos;
          inputRef.current.focus();
        }
      });
      setSlashActive(false);
    },
    [input, inputRef, setInput],
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

  const prevSlashActiveRef = useRef(slashActive);
  if (slashActive !== prevSlashActiveRef.current) {
    prevSlashActiveRef.current = slashActive;
    if (!slashActive) setSlashRect(null);
  }

  useEffect(() => {
    if (!slashActive || !containerRef.current) {
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
    [slashActive, filteredSkills, slashSelectedIdx],
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
    insertSlashSkill,
    removeSlashTokenFromInput,
    setSlashActive,
    handleSlashKeyDown,
  };
}
