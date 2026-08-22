/** Side-effects for FolderTabView (extracted for Sonar S3776). */

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ProjectTag } from './folderTabViewHelpers';

export function useFolderNavAltArrowKeys(goBack: () => void, goForward: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
    };
    globalThis.window.addEventListener('keydown', onKeyDown);
    return () => globalThis.window.removeEventListener('keydown', onKeyDown);
  }, [goBack, goForward]);
}

export function useProjectTagsLoader(
  effectiveProjectId: string,
  setProjectTags: Dispatch<SetStateAction<ProjectTag[]>>,
) {
  useEffect(() => {
    let cancelled = false;
    void globalThis.window.electron?.db?.tags?.getAll(effectiveProjectId).then((res) => {
      if (cancelled || !res?.success) return;
      setProjectTags((res.data as ProjectTag[] | undefined) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId, setProjectTags]);
}

export function useTaggedResourcesLoader(
  tagFilterId: string | null,
  effectiveProjectId: string,
  setTaggedResourceIds: Dispatch<SetStateAction<Set<string>>>,
) {
  useEffect(() => {
    if (!tagFilterId) {
      setTaggedResourceIds(new Set());
      return;
    }
    let cancelled = false;
    void globalThis.window.electron?.db?.tags?.getResources(tagFilterId, effectiveProjectId).then(
      (res) => {
        if (cancelled || !res?.success) return;
        setTaggedResourceIds(new Set((res.data ?? []).map((r) => r.id)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tagFilterId, effectiveProjectId, setTaggedResourceIds]);
}
