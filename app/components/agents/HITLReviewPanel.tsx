/**
 * HITLReviewPanel — agent interrupt, inline in chat (prototype .hitl).
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ManyHitlInlineCard from '@/components/many/ManyHitlInlineCard';
import type { RunPendingApproval } from '@/lib/chat/useAgentRunStream';

interface ActionDecision {
  type: 'approve' | 'reject';
  args?: Record<string, unknown>;
  message?: string;
}

interface HITLReviewPanelProps {
  pendingApproval: RunPendingApproval;
  onDismiss?: () => void;
  /** When true, no sticky footer chrome — only cards in the message stream */
  inline?: boolean;
}

function isShellTool(name: string): boolean {
  const n = name.toLowerCase();
  return n === 'shell_exec' || n.includes('shell');
}

function shellContextLine(args: Record<string, unknown>, t: (k: string) => string): string {
  const cwd = typeof args.cwd === 'string' && args.cwd.trim() ? args.cwd.trim() : '';
  return cwd ? `en: ${cwd}` : t('many.hitl_cwd_default');
}

export default function HITLReviewPanel({
  pendingApproval,
  onDismiss,
  inline = false,
}: HITLReviewPanelProps) {
  const { t } = useTranslation();
  const { actionRequests, reviewConfigs, submitResume } = pendingApproval;

  const [decisions, setDecisions] = useState<ActionDecision[]>(() =>
    actionRequests.map(() => ({ type: 'approve' as const })),
  );
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const setDecision = useCallback((idx: number, d: ActionDecision) => {
    setDecisions((prev) => {
      const next = prev.slice();
      next[idx] = d;
      return next;
    });
  }, []);

  const flushDecisions = useCallback(
    (next: ActionDecision[]) => {
      submitResume(
        next.map((d) =>
          d.type === 'approve'
            ? { type: 'approve', args: d.args }
            : { type: 'reject', message: d.message },
        ),
      );
      onDismiss?.();
    },
    [submitResume, onDismiss],
  );

  const submitOne = useCallback(
    (idx: number, approved: boolean) => {
      const req = actionRequests[idx];
      if (!req) return;
      const next = decisions.slice();
      next[idx] = approved
        ? { type: 'approve', args: req.args }
        : { type: 'reject', message: t('chat.rejected_by_user') };
      setDecisions(next);
      flushDecisions(next);
    },
    [actionRequests, decisions, flushDecisions, t],
  );

  const wrapperCls = inline ? 'flex flex-col gap-3' : 'many-hitl-panel px-4 py-3 border-t border-[var(--border-soft)] bg-[var(--bg)]';

  return (
    <div className={wrapperCls}>
      <div className={inline ? '' : 'many-msgs-inner mx-auto w-full max-w-[760px]'}>
        <div className="flex flex-col gap-3">
          {actionRequests.map((req, i) => {
            const allowReject =
              !reviewConfigs.find((rc) => rc.actionName === req.name) ||
              reviewConfigs.find((rc) => rc.actionName === req.name)?.allowedDecisions.includes('reject');
            const single = actionRequests.length === 1;

            if (isShellTool(req.name)) {
              const cmd = String(req.args?.command ?? '').trim();
              return (
                <ManyHitlInlineCard
                  key={i}
                  action={req.name}
                  target={cmd.length > 64 ? `${cmd.slice(0, 61)}…` : cmd || req.name}
                  previewCommand={cmd}
                  contextLine={shellContextLine(req.args ?? {}, t)}
                  showReject={allowReject}
                  onReject={() => (single ? submitOne(i, false) : setDecision(i, { type: 'reject', message: t('chat.rejected_by_user') }))}
                  onApprove={() => (single ? submitOne(i, true) : setDecision(i, { type: 'approve', args: req.args }))}
                />
              );
            }

            const previewLines = editingIdx === i
              ? undefined
              : Object.entries(req.args ?? {}).slice(0, 6).map(([k, v]) => ({
                  ctx: `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
                }));

            return (
              <ManyHitlInlineCard
                key={i}
                action={req.name}
                target={req.description?.slice(0, 64) || JSON.stringify(req.args ?? {}).slice(0, 64)}
                previewLines={previewLines}
                showReject={allowReject}
                showEditArgs={Object.keys(req.args ?? {}).length > 0}
                onEditArgs={() => setEditingIdx((prev) => (prev === i ? null : i))}
                onReject={() =>
                  single
                    ? submitOne(i, false)
                    : setDecision(i, { type: 'reject', message: t('chat.rejected_by_user') })
                }
                onApprove={() =>
                  single ? submitOne(i, true) : setDecision(i, { type: 'approve', args: req.args })
                }
              />
            );
          })}
        </div>

        {actionRequests.length > 1 ? (
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-danger" onClick={() => flushDecisions(actionRequests.map(() => ({ type: 'reject', message: t('chat.rejected_by_user') })))}>
              {t('chat.reject_all')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                flushDecisions(
                  decisions.map((d, i) =>
                    d.type === 'approve'
                      ? { type: 'approve', args: d.args ?? actionRequests[i]?.args }
                      : d,
                  ),
                );
              }}
            >
              {t('many.hitl_continue')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
