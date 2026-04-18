import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Search } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import type { Resource } from '@/types';
import DomeButton from '@/components/ui/DomeButton';

type FilterKind = 'all' | 'dictation' | 'call';

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function transcriptionKind(meta: Record<string, unknown>): 'dictation' | 'call' | null {
  const src = meta.source;
  if (src === 'call') return 'call';
  if (src === 'transcription') return 'dictation';
  return null;
}

export default function TranscriptionsListPage() {
  const { t } = useTranslation();
  const currentProject = useAppStore((s) => s.currentProject);
  const openTranscriptionDetailTab = useTabStore((s) => s.openTranscriptionDetailTab);
  const openNoteTab = useTabStore((s) => s.openNoteTab);

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKind>('all');
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
      if (res.success && Array.isArray(res.data)) {
        setResources(res.data);
      } else {
        setResources([]);
      }
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

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources
      .filter((r) => r.type === 'note')
      .map((r) => ({ r, meta: parseMeta(r.metadata) }))
      .filter(({ meta }) => transcriptionKind(meta) != null)
      .filter(({ meta }) => {
        if (filter === 'all') return true;
        return transcriptionKind(meta) === filter;
      })
      .filter(({ r }) => {
        if (!q) return true;
        return (r.title || '').toLowerCase().includes(q);
      })
      .sort((a, b) => (b.r.updated_at || 0) - (a.r.updated_at || 0));
  }, [resources, filter, query]);

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
          {(['all', 'dictation', 'call'] as const).map((f) => (
            <DomeButton
              key={f}
              type="button"
              size="sm"
              variant={filter === f ? 'primary' : 'outline'}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? t('transcriptions.filter_all') : f === 'dictation' ? t('transcriptions.filter_dictation') : t('transcriptions.filter_call')}
            </DomeButton>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('common.loading')}
          </p>
        ) : notes.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('transcriptions.list_empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map(({ r, meta }) => {
              const kind = transcriptionKind(meta)!;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                  style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                      <span className="truncate text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                        {r.title || r.id}
                      </span>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}
                      >
                        {kind === 'call' ? t('transcriptions.type_call') : t('transcriptions.type_dictation')}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <DomeButton type="button" size="sm" variant="ghost" onClick={() => openNoteTab(r.id, r.title || '')}>
                      {t('transcriptions.open_note')}
                    </DomeButton>
                    <DomeButton
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openTranscriptionDetailTab(r.id, r.title || '')}
                    >
                      {t('common.view')}
                    </DomeButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
