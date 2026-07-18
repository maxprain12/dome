import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, PencilEdit01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type HitlPreviewLine = {
  add?: string;
  rem?: string;
  ctx?: string;
};

export interface ManyHitlInlineCardProps {
  action: string;
  target: string;
  previewLines?: HitlPreviewLine[];
  previewCommand?: string;
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
 * Inline approval card for a paused run. A warning accent bar marks the
 * decision point; the preview block shows exactly what will execute.
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
  className,
}: ManyHitlInlineCardProps) {
  const { t } = useTranslation();
  const hasPreview = (previewLines && previewLines.length > 0) || Boolean(previewCommand?.trim());

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-warning/35 bg-card pl-1',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-warning/70" />

      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex items-start gap-2">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-warning">
              {t('many.hitl_confirm_title')}
            </p>
            <p className="mt-0.5 text-sm">
              <span className="font-medium">{action}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="break-all font-mono text-xs">{target}</span>
            </p>
          </div>
        </div>

        {hasPreview ? (
          <div className="max-h-44 overflow-y-auto rounded-lg bg-muted/50 p-2.5 font-mono text-xs">
            {previewCommand ? (
              <span className="block whitespace-pre-wrap break-all">
                {previewCommand.startsWith('$') ? previewCommand : `$ ${previewCommand}`}
              </span>
            ) : null}
            {previewLines?.map((line, i) => (
              <span key={i} className="block">
                {line.add ? <span className="text-success">+ {line.add}</span> : null}
                {line.rem ? <span className="text-destructive">- {line.rem}</span> : null}
                {line.ctx ? <span className="text-muted-foreground">{line.ctx}</span> : null}
              </span>
            ))}
          </div>
        ) : null}

        {contextLine ? <p className="text-xs text-muted-foreground">{contextLine}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onApprove}>
            <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" />
            {t('many.hitl_approve')}
          </Button>
          {showReject ? (
            <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={onReject}>
              {t('chat.reject')}
            </Button>
          ) : null}
          {showEditArgs && onEditArgs ? (
            <Button type="button" size="sm" variant="ghost" onClick={onEditArgs}>
              <HugeiconsIcon icon={PencilEdit01Icon} data-icon="inline-start" />
              {t('chat.edit_args')}
            </Button>
          ) : null}
          <span className="flex-1" aria-hidden />
          <span className="text-xs tabular-nums text-muted-foreground">
            {expiresSeconds != null && expiresSeconds > 0
              ? t('many.hitl_expires', { seconds: expiresSeconds })
              : t('many.hitl_run_paused')}
          </span>
        </div>
      </div>
    </div>
  );
}
