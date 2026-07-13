import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Mic01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import type { Resource } from '@/types';
import ViewerShell from '@/components/viewers/shared/ViewerShell';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    const matched: { r: Resource; meta: Record<string, unknown> }[] = [];
    for (const r of resources) {
      const meta = parseMeta(r.metadata);
      if (!isTranscriptionResource(r, meta)) continue;
      if (q && !(r.title || '').toLowerCase().includes(q)) continue;
      matched.push({ r, meta });
    }
    return matched.sort((a, b) => (b.r.updated_at || 0) - (a.r.updated_at || 0));
  }, [resources, query]);

  return (
    <ViewerShell
      title={t('transcriptions.list_title')}
      contextLabel={t('navigation.library', { defaultValue: 'Library' })}
      toolbar={(
        <InputGroup className="w-[min(22rem,50vw)]">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <InputGroupInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('transcriptions.search_placeholder')}
              aria-label={t('transcriptions.search_placeholder')}
          />
        </InputGroup>
      )}
      contentClassName="overflow-hidden"
    >
      <ScrollArea className="h-full">
        <div className="p-4">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            <span>{t('common.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><HugeiconsIcon icon={Mic01Icon} /></EmptyMedia>
              <EmptyTitle>{t('transcriptions.list_title')}</EmptyTitle>
              <EmptyDescription>{t('transcriptions.list_empty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {items.map(({ r, meta }) => {
              const sources = Array.isArray(meta.sources) ? (meta.sources as string[]) : [];
              const sourceLabel = sources.length
                ? sources.join(' + ')
                : r.type === 'audio'
                ? t('transcriptions.source_audio', 'Audio')
                : t('transcriptions.source_note', 'Note');
              return (
                <Item
                  key={r.id}
                  variant="outline"
                  size="sm"
                >
                  <ItemMedia variant="icon"><HugeiconsIcon icon={Mic01Icon} /></ItemMedia>
                  <ItemContent>
                    <ItemTitle>{r.title || r.id}</ItemTitle>
                    <ItemDescription><Badge variant="secondary">{sourceLabel}</Badge></ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button type="button" variant="outline" onClick={() => openTranscriptionDetailTab(r.id, r.title || '', r.project_id)} size="sm">
                      {t('common.view')}
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
        </div>
      </ScrollArea>
    </ViewerShell>
  );
}
