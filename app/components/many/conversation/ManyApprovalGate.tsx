import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ManyHitlInlineCard from '@/components/many/ManyHitlInlineCard';
import HITLReviewPanel from '@/components/agents/HITLReviewPanel';
import { ManyLoadingMarker } from './ManyNotices';
import { useApprovalStore } from '@/lib/store/useApprovalStore';
import type { RunPendingApproval } from '@/lib/chat/useAgentRunStream';

interface ManyApprovalGateProps {
  pendingApproval: RunPendingApproval | null;
  onDismissApproval?: () => void;
}

/**
 * The point where a run pauses for the user: renders queued tool approvals
 * (shell and generic) plus the full HITL review panel for structured resumes,
 * with a waiting marker underneath while the run is held.
 */
export default function ManyApprovalGate({
  pendingApproval,
  onDismissApproval,
}: ManyApprovalGateProps) {
  const { t } = useTranslation();
  const queue = useApprovalStore((s) => s.queue);
  const dequeue = useApprovalStore((s) => s.dequeue);
  const current = queue[0] ?? null;

  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    if (!current) {
      setExpiresAt(null);
      return;
    }
    setExpiresAt(Date.now() + current.timeoutMs);
  }, [current]);

  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const respondApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      dequeue(approvalId);
      window.electron?.approval?.respond?.(approvalId, approved);
    },
    [dequeue],
  );

  if (!current && !pendingApproval) return null;

  const isShell = current?.kind === 'shell_exec';
  const command = isShell ? String(current?.payload?.command ?? '') : '';
  const cwd = isShell ? String(current?.payload?.cwd ?? '') : '';
  const contextLine = cwd ? `en: ${cwd}` : t('many.hitl_cwd_default');

  return (
    <div className="flex w-full flex-col gap-3">
      {current ? (
        <ManyHitlInlineCard
          action={isShell ? 'shell_exec' : current.kind}
          target={
            isShell
              ? command.length > 80
                ? `${command.slice(0, 77)}…`
                : command
              : String(current.payload?.summary ?? current.kind)
          }
          previewCommand={isShell ? command : String(current.payload?.details ?? '')}
          contextLine={isShell ? contextLine : undefined}
          showReject
          expiresSeconds={secondsLeft}
          onReject={() => respondApproval(current.approvalId, false)}
          onApprove={() => respondApproval(current.approvalId, true)}
        />
      ) : null}

      {pendingApproval ? (
        <HITLReviewPanel pendingApproval={pendingApproval} onDismiss={onDismissApproval} inline />
      ) : null}

      <div className="flex flex-col gap-1">
        <ManyLoadingMarker label={t('many.hitl_waiting')} />
        <p className="text-xs text-muted-foreground">{t('many.hitl_waiting_detail')}</p>
      </div>
    </div>
  );
}
