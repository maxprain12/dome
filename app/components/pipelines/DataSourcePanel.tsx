import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, FileSpreadsheet, Hand, Plus, RefreshCw, Sparkles, Trash2, Loader2 } from 'lucide-react';
import type { CreateSourceInput, PipelineSource, PipelineStage, SourceType } from '@/lib/pipelines/types';
import SourceConfigModal from './SourceConfigModal';

const SOURCE_ICON: Record<SourceType, typeof Database> = {
  internal_resources: Database,
  excel: FileSpreadsheet,
  manual: Hand,
  external_db: Database,
  prompt_mcp: Sparkles,
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
      style={{ width: 'min(240px, 26vw)', borderRight: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--secondary-text)' }}>
          {t('pipelines.data_sources')}
        </span>
        <button
          type="button"
          onClick={() => setAdding(true)}
          title={t('pipelines.add_source')}
          aria-label={t('pipelines.add_source')}
          style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 2 }}
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 p-2">
        {sources.length === 0 && (
          <span className="text-xs text-center py-3" style={{ color: 'var(--tertiary-text)' }}>
            {t('pipelines.no_sources')}
          </span>
        )}
        {sources.map((s) => {
          const Icon = SOURCE_ICON[s.sourceType];
          const syncing = syncingId === s.id;
          return (
            <div
              key={s.id}
              className="rounded-md p-2 flex flex-col gap-1"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-1.5">
                <Icon size={13} style={{ color: 'var(--accent)' }} aria-hidden />
                <span className="text-sm flex-1 truncate" style={{ color: 'var(--primary-text)' }}>
                  {s.name}
                </span>
                <button
                  type="button"
                  onClick={() => void onDelete(s.id)}
                  title={t('pipelines.delete')}
                  aria-label={t('pipelines.delete')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--tertiary-text)', cursor: 'pointer', padding: 1 }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <span className="text-[10px]" style={{ color: 'var(--tertiary-text)' }}>
                {sourceLabel(s.sourceType)}
                {s.lastSyncStatus ? ` · ${s.lastSyncStatus}` : ''}
              </span>
              {s.sourceType !== 'manual' && (
                <button
                  type="button"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncingId(s.id);
                    try {
                      await onSync(s.id);
                    } finally {
                      setSyncingId(null);
                    }
                  }}
                  className="text-[11px] px-2 py-0.5 rounded-md inline-flex items-center gap-1 self-start"
                  style={{ background: 'transparent', color: 'var(--accent)', border: '1px solid var(--border)', cursor: syncing ? 'wait' : 'pointer' }}
                >
                  {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {t('pipelines.sync')}
                </button>
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
