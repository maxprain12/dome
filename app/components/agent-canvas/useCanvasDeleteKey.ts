import { useEffect } from 'react';

export function useCanvasDeleteKey(
  selectedNodeId: string | null,
  removeNode: (nodeId: string) => void,
  clearSelection: () => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (!selectedNodeId) return;
      e.preventDefault();
      removeNode(selectedNodeId);
      clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedNodeId, removeNode, clearSelection]);
}
