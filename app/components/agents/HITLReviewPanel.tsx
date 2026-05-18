/**
 * HITLReviewPanel — Human-in-the-Loop approval panel.
 *
 * Rendered as a sticky bottom panel when a LangGraph agent emits an interrupt.
 * Allows the user to approve, reject, or modify tool arguments before resuming.
 *
 * Replaces the minimal approve-all/reject-all banner that was inline in ManyPanel
 * and AgentChatView with a per-action review experience.
 */

import { useState, useCallback } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RunPendingApproval } from '@/lib/chat/useLangGraphRunStream';

interface ActionDecision {
  type: 'approve' | 'reject';
  args?: Record<string, unknown>;
  message?: string;
}

interface HITLReviewPanelProps {
  pendingApproval: RunPendingApproval;
  onDismiss?: () => void;
}

function JSONEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleChange = (raw: string) => {
    setText(raw);
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        setError(null);
        onChange(parsed as Record<string, unknown>);
      } else {
        setError('Must be a JSON object');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <div className="relative">
      <textarea
        className="input w-full font-mono text-[11px] leading-relaxed"
        rows={Math.min(12, text.split('\n').length + 1)}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
      />
      {error && (
        <p className="mt-0.5 text-[10px] text-[var(--error,#ef4444)]">{error}</p>
      )}
    </div>
  );
}

function ActionCard({
  req,
  idx,
  reviewConfig,
  decision,
  onDecide,
}: {
  req: { name: string; args: Record<string, unknown>; description?: string };
  idx: number;
  reviewConfig?: { actionName: string; allowedDecisions: string[] };
  decision: ActionDecision;
  onDecide: (d: ActionDecision) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>(req.args ?? {});

  const allowReject = !reviewConfig || reviewConfig.allowedDecisions.includes('reject');

  const approve = useCallback(() => {
    onDecide({ type: 'approve', args: editMode ? editedArgs : req.args });
  }, [editMode, editedArgs, req.args, onDecide]);

  const reject = useCallback(() => {
    onDecide({ type: 'reject', message: t('chat.rejected_by_user') });
  }, [t, onDecide]);

  const isApproved = decision.type === 'approve';
  const isRejected = decision.type === 'reject';

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isApproved
          ? 'border-[var(--accent)] bg-[var(--accent)]/5'
          : isRejected
          ? 'border-[var(--error,#ef4444)]/50 bg-[var(--error,#ef4444)]/5'
          : 'border-[var(--border)] bg-[var(--bg)]'
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--tertiary-text)]">
              {t('chat.action')} {idx + 1}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] font-semibold text-[var(--primary-text)]">
            {req.name}
          </p>
          {req.description && (
            <p className="mt-0.5 text-[11px] text-[var(--secondary-text)] line-clamp-2">
              {req.description}
            </p>
          )}
        </div>

        {/* Decision buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {allowReject && (
            <button
              type="button"
              title={t('chat.reject')}
              onClick={reject}
              className={`rounded p-1 transition-colors ${
                isRejected
                  ? 'text-[var(--error,#ef4444)]'
                  : 'text-[var(--tertiary-text)] hover:text-[var(--error,#ef4444)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <XCircle size={16} />
            </button>
          )}
          <button
            type="button"
            title={t('chat.approve')}
            onClick={approve}
            className={`rounded p-1 transition-colors ${
              isApproved
                ? 'text-[var(--accent)]'
                : 'text-[var(--tertiary-text)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <CheckCircle size={16} />
          </button>
        </div>
      </div>

      {/* Args preview / editor toggle */}
      {Object.keys(req.args ?? {}).length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {t('chat.view_arguments')}
            </button>
            {expanded && (
              <button
                type="button"
                className={`flex items-center gap-1 text-[10px] transition-colors ${
                  editMode
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--secondary-text)] hover:text-[var(--primary-text)]'
                }`}
                onClick={() => setEditMode((prev) => !prev)}
              >
                <Edit3 size={10} />
                {editMode ? t('chat.editing') : t('chat.edit_args')}
              </button>
            )}
          </div>

          {expanded && (
            <div className="mt-1.5">
              {editMode ? (
                <JSONEditor value={editedArgs} onChange={setEditedArgs} />
              ) : (
                <pre className="overflow-x-auto rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-[10px] text-[var(--secondary-text)] leading-relaxed">
                  {JSON.stringify(req.args, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HITLReviewPanel({ pendingApproval, onDismiss }: HITLReviewPanelProps) {
  const { t } = useTranslation();
  const { actionRequests, reviewConfigs, submitResume } = pendingApproval;

  const [decisions, setDecisions] = useState<ActionDecision[]>(() =>
    actionRequests.map(() => ({ type: 'approve' as const })),
  );

  const setDecision = useCallback((idx: number, d: ActionDecision) => {
    setDecisions((prev) => {
      const next = prev.slice();
      next[idx] = d;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    submitResume(
      decisions.map((d) =>
        d.type === 'approve'
          ? { type: 'approve', args: d.args }
          : { type: 'reject', message: d.message },
      ),
    );
    onDismiss?.();
  }, [decisions, submitResume, onDismiss]);

  const handleApproveAll = useCallback(() => {
    setDecisions(actionRequests.map((_r, i) => ({ type: 'approve' as const, args: actionRequests[i]?.args })));
    submitResume(actionRequests.map((r) => ({ type: 'approve', args: r.args })));
    onDismiss?.();
  }, [actionRequests, submitResume, onDismiss]);

  const handleRejectAll = useCallback(() => {
    setDecisions(actionRequests.map(() => ({ type: 'reject' as const, message: t('chat.rejected_by_user') })));
    submitResume(actionRequests.map(() => ({ type: 'reject', message: t('chat.rejected_by_user') })));
    onDismiss?.();
  }, [actionRequests, submitResume, t, onDismiss]);

  const pendingCount = decisions.filter((d) => d.type === 'approve').length;
  const rejectedCount = decisions.filter((d) => d.type === 'reject').length;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      {/* Compact header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="text-[11px] font-medium text-[var(--primary-text)]">
            {t(
              actionRequests.length === 1
                ? 'chat.pending_action_one'
                : 'chat.pending_action_other',
              { count: actionRequests.length },
            )}
          </span>
          {rejectedCount > 0 && (
            <span className="text-[10px] text-[var(--secondary-text)]">
              ({rejectedCount} {t('chat.rejected')})
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleRejectAll}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--secondary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
          >
            {t('chat.reject_all')}
          </button>
          <button
            type="button"
            onClick={handleApproveAll}
            className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-white"
          >
            {t('chat.approve_all')}
          </button>
          {actionRequests.length > 1 && (
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-md border border-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
            >
              {t('chat.submit_decisions', { approved: pendingCount, rejected: rejectedCount })}
            </button>
          )}
        </div>
      </div>

      {/* Per-action cards */}
      <div className="space-y-2 px-3 pb-3">
        {actionRequests.map((req, i) => (
          <ActionCard
            key={i}
            idx={i}
            req={req}
            reviewConfig={reviewConfigs.find((rc) => rc.actionName === req.name)}
            decision={decisions[i] ?? { type: 'approve' }}
            onDecide={(d) => setDecision(i, d)}
          />
        ))}
      </div>
    </div>
  );
}
