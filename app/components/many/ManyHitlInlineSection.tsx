import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ManyHitlInlineCard from './ManyHitlInlineCard';
import ManyMinimalStatusRow from './ManyMinimalStatusRow';
import { useApprovalStore } from '@/lib/store/useApprovalStore';
import type { RunPendingApproval } from '@/lib/chat/useAgentRunStream';
import HITLReviewPanel from '@/components/agents/HITLReviewPanel';

interface ManyHitlInlineSectionProps {
  pendingApproval: RunPendingApproval | null;
  onDismissApproval?: () => void;
}

/**
 * Renders HITL inline in the Many message stream (approval queue + agent interrupt).
 */
export default function ManyHitlInlineSection({
  pendingApproval,
  onDismissApproval,
}: ManyHitlInlineSectionProps) {
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

  const showWaiting = Boolean(current || pendingApproval);

  if (!showWaiting) return null;

  const isShell = current?.kind === 'shell_exec';
  const command = isShell ? String(current?.payload?.command ?? '') : '';
  const cwd = isShell ? String(current?.payload?.cwd ?? '') : '';
  const contextLine = cwd ? `en: ${cwd}` : t('many.hitl_cwd_default');

  return (
    <div className="many-hitl-stream-block many-message-group w-full">
      {current && isShell ? (
        <ManyHitlInlineCard
          action="shell_exec"
          target={command.length > 80 ? `${command.slice(0, 77)}…` : command}
          previewCommand={command}
          contextLine={contextLine}
          showReject
          expiresSeconds={secondsLeft}
          onReject={() => respondApproval(current.approvalId, false)}
          onApprove={() => respondApproval(current.approvalId, true)}
        />
      ) : null}

      {current && !isShell ? (
        <ManyHitlInlineCard
          action={current.kind}
          target={String(current.payload?.summary ?? current.kind)}
          previewCommand={String(current.payload?.details ?? '')}
          showReject
          expiresSeconds={secondsLeft}
          onReject={() => respondApproval(current.approvalId, false)}
          onApprove={() => respondApproval(current.approvalId, true)}
        />
      ) : null}

      {pendingApproval ? (
        <HITLReviewPanel pendingApproval={pendingApproval} onDismiss={onDismissApproval} inline />
      ) : null}

      <div className="many-hitl-stream-status">
        <ManyMinimalStatusRow variant="dots" label={t('many.hitl_waiting')} />
        <p className="many-hitl-stream-status__hint">{t('many.hitl_waiting_detail')}</p>
      </div>
    </div>
  );
}
