import { useCallback, useEffect, useRef, useState } from 'react';

export interface MentionResource {
  id: string;
  title: string;
  type: string;
}

export interface UseResourceMentionOptions {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPinResource: (resource: MentionResource) => void;
  /** When false, @ detection is disabled (legacy input). */
  enabled?: boolean;
}

/**
 * @-mention picker for workspace resources (resourceSearch / resourceList via IPC).
 */
export function useResourceMention({
  input,
  setInput,
  inputRef,
  containerRef,
  onPinResource,
  enabled = true,
}: UseResourceMentionOptions) {
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResources, setMentionResources] = useState<MentionResource[]>([]);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const [mentionRect, setMentionRect] = useState<{ top: number; left: number } | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  const loadMentionResources = useCallback(async (query: string) => {
    const electron = typeof window !== 'undefined' ? window.electron : null;
    if (!electron?.ai?.tools) return;
    try {
      let resources: MentionResource[] = [];
      if (query.trim() && electron.ai?.tools?.resourceSearch) {
        const result = await electron.ai.tools.resourceSearch(query, { limit: 15 });
        if (result?.success && Array.isArray(result?.results)) {
          resources = result.results.map((r: { id: string; title: string; type: string }) => ({
            id: r.id,
            title: r.title,
            type: r.type,
          }));
        }
      } else if (electron.ai?.tools?.resourceList) {
        const result = await electron.ai.tools.resourceList({ limit: 20 });
        if (result?.success && Array.isArray(result?.resources)) {
          resources = result.resources.map((r: { id: string; title: string; type: string }) => ({
            id: r.id,
            title: r.title,
            type: r.type,
          }));
        }
      }
      setMentionResources(resources);
      setMentionSelectedIdx(0);
    } catch {
      setMentionResources([]);
    }
  }, []);

  const selectMentionResource = useCallback(
    (resource: MentionResource) => {
      const cursor = inputRef.current?.selectionStart ?? input.length;
      const atIdx = input.slice(0, cursor).lastIndexOf('@');
      if (atIdx !== -1) {
        const newInput = input.slice(0, atIdx) + input.slice(cursor);
        setInput(newInput);
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = atIdx;
            inputRef.current.selectionEnd = atIdx;
            inputRef.current.focus();
          }
        });
      }
      onPinResource(resource);
      setMentionActive(false);
    },
    [input, inputRef, setInput, onPinResource],
  );

  const updateFromText = useCallback(
    (val: string, cursor: number) => {
      if (!enabled) {
        setMentionActive(false);
        return;
      }
      const textUpToCursor = val.slice(0, cursor);
      const atIdx = textUpToCursor.lastIndexOf('@');

      if (atIdx !== -1) {
        const charBefore = atIdx === 0 ? ' ' : textUpToCursor[atIdx - 1];
        const validTrigger = atIdx === 0 || /\s/.test(charBefore ?? '');
        const afterAt = textUpToCursor.slice(atIdx + 1);
        if (validTrigger && !afterAt.includes(' ') && !afterAt.includes('\n')) {
          setMentionQuery(afterAt);
          setMentionActive(true);
          return;
        }
      }
      setMentionActive(false);
    },
    [enabled],
  );

  useEffect(() => {
    if (!mentionActive) return;
    void loadMentionResources(mentionQuery);
  }, [mentionQuery, mentionActive, loadMentionResources]);

  useEffect(() => {
    if (!mentionActive || !containerRef.current) {
      setMentionRect(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setMentionRect({ top: rect.top, left: rect.left });
  }, [mentionActive, containerRef]);

  useEffect(() => {
    if (!mentionActive) return;
    const handler = (e: MouseEvent) => {
      if (mentionDropdownRef.current && !mentionDropdownRef.current.contains(e.target as Node)) {
        setMentionActive(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mentionActive]);

  const mentionKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!mentionActive) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIdx((i) => Math.min(i + 1, Math.max(mentionResources.length - 1, 0)));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIdx((i) => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = mentionResources[mentionSelectedIdx];
        if (selected) selectMentionResource(selected);
        return true;
      }
      if (e.key === 'Escape') {
        setMentionActive(false);
        return true;
      }
      return false;
    },
    [mentionActive, mentionResources, mentionSelectedIdx, selectMentionResource],
  );

  const insertAtSymbol = useCallback(() => {
    const ta = inputRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? input.length;
    const newVal = input.slice(0, pos) + '@' + input.slice(pos);
    setInput(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = pos + 1;
      ta.selectionEnd = pos + 1;
      const event = new Event('input', { bubbles: true });
      ta.dispatchEvent(event);
    });
  }, [input, inputRef, setInput]);

  return {
    mentionActive,
    mentionQuery,
    mentionResources,
    mentionSelectedIdx,
    mentionRect,
    mentionDropdownRef,
    selectMentionResource,
    updateFromText,
    mentionKeyDown,
    insertAtSymbol,
    setMentionActive,
  };
}
