import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Search } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import type { Resource } from '@/types';
import DomeButton from '@/components/ui/DomeButton';

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * A resource counts as a transcription if EITHER:
 *   - it's a 'note' with `meta.source` ∈ {transcription, call}  (legacy)
 *   - it's an 'audio' with `meta.kind === 'transcription'`        (new)
 */
function isTranscriptionResource(r: Resource, meta: Record<string, unknown>): boolean {
  if (r.type === 'note') {
    const src = meta.source;
    return src === 'transcription' || src === 'call';
  }
  if (r.type === 'audio') {
    return meta.kind === 'transcription';
  }
  return false;
}

export default function TranscriptionsListPage() {
  const { t } = useTranslation();
  const currentProject = useAppStore((s) => s.currentProject);
  const openTranscriptionDetailTab = useTabStore((s) => s.openTranscriptionDetailTab);

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const pid = currentProject?.id;
    if (!pid || !window.electron?.db?.resources?.getByProject) {
      setResources([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await window.electron.db.resources.getByProject(pid);
      if (res.success && Array.isArray(res.data)) setResources(res.data);
      else setResources([]);
    } catch {
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!window.electron?.on) return undefined;
    const unsub = window.electron.on('resource:created', () => void load());
    const unsub2 = window.electron.on('resource:updated', () => void load());
    return () => {
      unsub?.();
      unsub2?.();
    };
  }, [load]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources
      .map((r) => ({ r, meta: parseMeta(r.metadata) }))
      .filter(({ r, meta }) => isTranscriptionResource(r, meta))
      .filter(({ r }) => {
        if (!q) return true;
        return (r.title || '').toLowerCase().includes(q);
      })
      .sort((a, b) => (b.r.updated_at || 0) - (a.r.updated_at || 0));
  }, [resources, query]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: 'var(--dome-border)' }}>
        <h1 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
          {t('transcriptions.list_title')}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border px-2 py-1.5"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
          >
            <Search className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('transcriptions.search_placeholder')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--dome-text)' }}
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('common.loading')}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('transcriptions.list_empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map(({ r, meta }) => {
              const sources = Array.isArray(meta.sources) ? (meta.sources as string[]) : [];
              const sourceLabel = sources.length
                ? sources.join(' + ')
                : r.type === 'audio'
                ? t('transcriptions.source_audio', 'Audio')
                : t('transcriptions.source_note', 'Note');
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                  style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                      <span className="truncate text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                        {r.title || r.id}
                      </span>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}
                      >
                        {sourceLabel}
                      </span>
                    </div>
                  </div>
                  <DomeButton
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openTranscriptionDetailTab(r.id, r.title || '')}
                  >
                    {t('common.view')}
                  </DomeButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
