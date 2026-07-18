import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { DatabaseIcon, Delete02Icon, FileSpreadsheetIcon, HandIcon, Loading03Icon, PlusSignIcon, RefreshIcon, SparklesIcon } from '@hugeicons/core-free-icons';
import type { CreateSourceInput, PipelineSource, PipelineStage, SourceType } from '@/lib/pipelines/types';
import SourceConfigModal from './SourceConfigModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const SOURCE_ICON: Record<SourceType, IconSvgElement> = {
  internal_resources: DatabaseIcon,
  excel: FileSpreadsheetIcon,
  manual: HandIcon,
  external_db: DatabaseIcon,
  prompt_mcp: SparklesIcon,
};

interface Props {
  sources: PipelineSource[];
  stages: PipelineStage[];
  onCreate: (input: Omit<CreateSourceInput, 'pipelineId'>) => Promise<void>;
  onSync: (sourceId: string) => Promise<void>;
  onDelete: (sourceId: string) => Promise<void>;
}

export default function DataSourcePanel({ sources, stages, onCreate, onSync, onDelete }: Props) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const sourceLabel = (s: SourceType) =>
    t(`pipelines.source_${s === 'internal_resources' ? 'internal' : s}`);

  return (
    <div
      className="flex flex-col shrink-0 h-full overflow-y-auto"
      style={{ width: 'min(240px, 26vw)', borderRight: '1px solid var(--border)', background: 'var(--card)' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('pipelines.data_sources')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setAdding(true)}
          title={t('pipelines.add_source')}
          aria-label={t('pipelines.add_source')}
        >
          <HugeiconsIcon icon={PlusSignIcon} />
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 p-2">
        {sources.length === 0 && (
          <span className="text-xs text-center py-3 text-muted-foreground">
            {t('pipelines.no_sources')}
          </span>
        )}
        {sources.map((s) => {
          const sourceIcon = SOURCE_ICON[s.sourceType];
          const syncing = syncingId === s.id;
          return (
            <div
              key={s.id}
              className="rounded-md p-2 flex flex-col gap-1"
              style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={sourceIcon} size={13} className="text-primary" aria-hidden />
                <span className="text-sm flex-1 truncate text-foreground">
                  {s.name}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button type="button" variant="ghost" size="icon-xs" />}>
                    <HugeiconsIcon icon={Delete02Icon} className="text-destructive" />
                    <span className="sr-only">{t('pipelines.delete')}</span>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('pipelines.delete')}</AlertDialogTitle>
                      <AlertDialogDescription>{s.name}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('pipelines.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void onDelete(s.id)}>{t('pipelines.delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {sourceLabel(s.sourceType)}
                {s.lastSyncStatus ? ` · ${s.lastSyncStatus}` : ''}
              </span>
              {s.sourceType !== 'manual' && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncingId(s.id);
                    try {
                      await onSync(s.id);
                    } finally {
                      setSyncingId(null);
                    }
                  }}
                  className="self-start text-[11px]"
                >
                  {syncing ? <HugeiconsIcon icon={Loading03Icon} size={11} className="animate-spin" /> : <HugeiconsIcon icon={RefreshIcon} size={11} />}
                  {t('pipelines.sync')}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <SourceConfigModal stages={stages} onClose={() => setAdding(false)} onCreate={onCreate} />
      )}
    </div>
  );
}
