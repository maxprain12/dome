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
  /** Scope list/search to the active project. */
  projectId?: string | null;
}

function filterResourcesByQuery(resources: MentionResource[], query: string): MentionResource[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return resources;
  return resources.filter((resource) => {
    const title = resource.title.toLowerCase();
    if (title.includes(normalized)) return true;
    return title.split(/\s+/).some((word) => word.startsWith(normalized));
  });
}

function mapDbResources(
  rows: Array<{ id: string; title: string; type: string }>,
): MentionResource[] {
  return rows
    .filter((row) => row.type !== 'folder')
    .map((row) => ({
      id: row.id,
      title: row.title || 'Untitled',
      type: row.type,
    }));
}

/**
 * @-mention picker for workspace resources.
 * Uses the same db IPC as the sidebar/editor (`listLight`, `searchForMention`) —
 * not ai.tools.resourceList, which can fail on corrupt metadata JSON.
 */
export function useResourceMention({
  input,
  setInput,
  inputRef,
  containerRef,
  onPinResource,
  enabled = true,
  projectId = null,
}: UseResourceMentionOptions) {
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResources, setMentionResources] = useState<MentionResource[]>([]);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const [mentionRect, setMentionRect] = useState<{ top: number; left: number } | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  const loadMentionResources = useCallback(
    async (query: string) => {
      const electron = typeof window !== 'undefined' ? window.electron : null;
      const dbResources = electron?.db?.resources;
      if (!dbResources?.listLight || !dbResources?.searchForMention) return;

      const scopedProjectId = projectId || 'default';
      const trimmed = query.trim();

      try {
        let resources: MentionResource[] = [];

        if (trimmed.length === 0) {
          const listResult = await dbResources.listLight(25, scopedProjectId);
          if (listResult?.success && Array.isArray(listResult.data)) {
            resources = mapDbResources(listResult.data);
          }
        } else {
          const searchResult = await dbResources.searchForMention(trimmed, scopedProjectId);
          if (searchResult?.success && Array.isArray(searchResult.data)) {
            resources = mapDbResources(searchResult.data);
          }

          if (resources.length === 0) {
            const listResult = await dbResources.listLight(50, scopedProjectId);
            if (listResult?.success && Array.isArray(listResult.data)) {
              resources = filterResourcesByQuery(mapDbResources(listResult.data), trimmed);
            }
          }
        }

        setMentionResources(resources);
        setMentionSelectedIdx(0);
      } catch {
        setMentionResources([]);
      }
    },
    [projectId],
  );

  const selectMentionResource = useCallback(
    (resource: MentionResource) => {
      const cursor = inputRef.current?.selectionStart ?? input.length;
      const textUpToCursor = input.slice(0, cursor);
      const atIdx = textUpToCursor.lastIndexOf('@');
      if (atIdx !== -1) {
        const insertion = `@${resource.title} `;
        const newInput = input.slice(0, atIdx) + insertion + input.slice(cursor);
        setInput(newInput);
        const pos = atIdx + insertion.length;
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = pos;
            inputRef.current.selectionEnd = pos;
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

  const prevMentionActiveRef = useRef(mentionActive);
  if (mentionActive !== prevMentionActiveRef.current) {
    prevMentionActiveRef.current = mentionActive;
    if (!mentionActive) setMentionRect(null);
  }

  useEffect(() => {
    if (!mentionActive || !containerRef.current) {
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
    const nextCursor = pos + 1;
    setInput(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = nextCursor;
      ta.selectionEnd = nextCursor;
      updateFromText(newVal, nextCursor);
    });
  }, [input, inputRef, setInput, updateFromText]);

  return {
    mentionActive,
    mentionQuery,
    mentionResources,
    mentionSelectedIdx,
    setMentionSelectedIdx,
    mentionRect,
    mentionDropdownRef,
    selectMentionResource,
    updateFromText,
    mentionKeyDown,
    insertAtSymbol,
    setMentionActive,
  };
}
