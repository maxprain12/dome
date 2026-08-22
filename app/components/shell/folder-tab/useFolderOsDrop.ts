/** OS file drag-and-drop for FolderTabView (extracted for Sonar S3776). */

import { useCallback, useRef, useState } from 'react';

export function useFolderOsDrop(importPathsIntoView: (paths: string[]) => Promise<void>) {
  // dragenter/dragleave fire on every child; a depth counter keeps the overlay
  // stable until the pointer actually leaves the view.
  const dragDepthRef = useRef(0);
  const [osDropActive, setOsDropActive] = useState(false);

  const isOsFileDrag = useCallback((e: React.DragEvent) => {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
  }, []);

  const handleOsDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setOsDropActive(true);
    },
    [isOsFileDrag],
  );

  const handleOsDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [isOsFileDrag],
  );

  const handleOsDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!isOsFileDrag(e)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setOsDropActive(false);
    },
    [isOsFileDrag],
  );

  const handleOsDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setOsDropActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (!files.length) return;
      const paths = (globalThis.window.electron?.getPathsForFiles?.(files) ?? []).filter(
        Boolean,
      ) as string[];
      if (!paths.length) return;
      await importPathsIntoView(paths);
    },
    [isOsFileDrag, importPathsIntoView],
  );

  return {
    osDropActive,
    handleOsDragEnter,
    handleOsDragOver,
    handleOsDragLeave,
    handleOsDrop,
  };
}
