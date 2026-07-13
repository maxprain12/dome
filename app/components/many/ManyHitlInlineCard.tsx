import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, PencilEdit01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
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
    <Card className={cn('border-warning/40 bg-warning/5', className)}>
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <Badge variant="outline" className="shrink-0 border-warning/40 text-warning">
          <HugeiconsIcon icon={Alert02Icon} data-icon="inline-start" />
          {t('many.hitl_confirm_title')}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {action}
            <span className="text-muted-foreground"> · </span>
            <span className="font-mono text-xs">{target}</span>
          </p>
        </div>
      </CardHeader>

      {hasPreview ? (
        <CardContent className="pb-2">
          <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs">
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
        </CardContent>
      ) : null}

      {contextLine ? (
        <CardContent className={cn('pt-0', hasPreview && 'pb-2')}>
          <p className="text-xs text-muted-foreground">{contextLine}</p>
        </CardContent>
      ) : null}

      <CardFooter className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onApprove}>
          <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" />
          {t('many.hitl_approve')}
        </Button>
        {showReject ? (
          <Button type="button" size="sm" variant="destructive" onClick={onReject}>
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
        {expiresSeconds != null && expiresSeconds > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('many.hitl_expires', { seconds: expiresSeconds })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('many.hitl_run_paused')}</span>
        )}
      </CardFooter>
    </Card>
  );
}
