import { useEffect } from 'react';
import { useApprovalStore } from '@/lib/store/useApprovalStore';

/**
 * Enqueues shell/tool approvals from the main process. UI is inline in ManyPanel
 * (ManyApprovalGate), not a modal overlay.
 */
export default function ApprovalProvider() {
  const enqueue = useApprovalStore((s) => s.enqueue);

  useEffect(() => {
    if (!window.electron?.approval?.onRequested) return;
    const cleanup = window.electron.approval.onRequested((data) => {
      enqueue({
        approvalId: data.approvalId,
        kind: data.kind,
        payload: data.payload as Record<string, unknown>,
        timeoutMs: data.timeoutMs ?? 60_000,
      });
    });
    return cleanup;
  }, [enqueue]);

  return null;
}
