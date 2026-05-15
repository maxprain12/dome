import { useEffect, useCallback } from 'react';
import { useApprovalStore } from '@/lib/store/useApprovalStore';
import ApprovalModal from './ApprovalModal';

/**
 * Mount once in AppShell. Listens to approval:requested from the main process,
 * queues modals, and forwards responses back via window.electron.approval.respond.
 */
export default function ApprovalProvider() {
  const { queue, enqueue, dequeue } = useApprovalStore();

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

  const handleRespond = useCallback(
    (approvalId: string, approved: boolean) => {
      dequeue(approvalId);
      window.electron?.approval?.respond?.(approvalId, approved);
    },
    [dequeue],
  );

  // Only show the first queued request (next shows after this one is resolved).
  const current = queue[0] ?? null;
  if (!current) return null;

  return <ApprovalModal key={current.approvalId} request={current} onRespond={handleRespond} />;
}
