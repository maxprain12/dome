import { AlertTriangle, Check, Edit3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type HitlPreviewLine = {
  add?: string;
  rem?: string;
  ctx?: string;
};

export interface ManyHitlInlineCardProps {
  /** Tool or action name, e.g. shell_exec */
  action: string;
  /** Short target shown in subtitle (command summary, path, etc.) */
  target: string;
  /** Monospace preview lines (diff) — omit to use previewCommand only */
  previewLines?: HitlPreviewLine[];
  /** Single command block in preview (shell_exec) */
  previewCommand?: string;
  /** Secondary line under preview (e.g. working directory) */
  contextLine?: string | null;
  onApprove: () => void;
  onReject?: () => void;
  onEditArgs?: () => void;
  showEditArgs?: boolean;
  showReject?: boolean;
  expiresSeconds?: number | null;
  className?: string;
}

/**
 * Inline HITL card in the chat stream (prototype: warning border, preview, Aprobar/Rechazar).
 */
export default function ManyHitlInlineCard({
  action,
  target,
  previewLines,
  previewCommand,
  contextLine,
  onApprove,
  onReject,
  onEditArgs,
  showEditArgs = false,
  showReject = true,
  expiresSeconds = null,
  className = '',
}: ManyHitlInlineCardProps) {
  const { t } = useTranslation();
  const hasPreview = (previewLines && previewLines.length > 0) || Boolean(previewCommand?.trim());

  return (
    <div className={`hitl many-hitl-inline ${className}`.trim()}>
      <div className="hitl-hd">
        <div className="hitl-badge" aria-hidden>
          <AlertTriangle size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="hitl-title">{t('many.hitl_confirm_title')}</div>
          <div className="hitl-sub">
            {action}
            <span className="hitl-sub__sep"> · </span>
            <span className="hitl-sub__mono">{target}</span>
          </div>
        </div>
      </div>

      {hasPreview ? (
        <div className="hitl-preview">
          {previewCommand ? (
            <span className="diff-line hitl-preview__command">{previewCommand.startsWith('$') ? previewCommand : `$ ${previewCommand}`}</span>
          ) : null}
          {previewLines?.map((line, i) => (
            <span key={i} className="diff-line">
              {line.add ? <span className="diff-add">+ {line.add}</span> : null}
              {line.rem ? <span className="diff-rem">- {line.rem}</span> : null}
              {line.ctx ? <span className="diff-ctx">{line.ctx}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
      {contextLine && !hasPreview ? (
        <p className="hitl-context-line">{contextLine}</p>
      ) : null}
      {contextLine && hasPreview && previewCommand ? (
        <p className="hitl-context-line hitl-context-line--after">{contextLine}</p>
      ) : null}

      <div className="hitl-actions">
        <button type="button" className="btn btn-primary" onClick={onApprove}>
          <Check size={14} strokeWidth={2.2} aria-hidden />
          {t('many.hitl_approve')}
        </button>
        {showReject ? (
          <button type="button" className="btn btn-danger" onClick={onReject}>
            {t('chat.reject')}
          </button>
        ) : null}
        {showEditArgs && onEditArgs ? (
          <button type="button" className="btn btn-ghost" onClick={onEditArgs}>
            <Edit3 size={13} aria-hidden />
            {t('chat.edit_args')}
          </button>
        ) : null}
        <span className="hitl-actions__spacer" aria-hidden />
        {expiresSeconds != null && expiresSeconds > 0 ? (
          <span className="hitl-expires tabular-nums">
            {t('many.hitl_expires', { seconds: expiresSeconds })}
          </span>
        ) : (
          <span className="hitl-paused">{t('many.hitl_run_paused')}</span>
        )}
      </div>
    </div>
  );
}
