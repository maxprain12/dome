import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import HubListState from '@/components/ui/HubListState';
import { useTabStore } from '@/lib/store/useTabStore';
import SemanticGraphCanvas, {
  SEMANTIC_RESOURCE_TYPE_FILL,
  type GraphEdgeDatum,
  type GraphNodeDatum,
} from './SemanticGraphCanvas';
import { EdgeConfirmPanel, type SemanticEdgePanelData } from './EdgeConfirmPanel';
import './semantic-graph-toolbar.css';

export type SemanticFilterMode = 'all' | 'auto' | 'strong' | 'confirmed';

const GRAPH_RESOURCE_TYPES = ['note', 'pdf', 'url', 'document', 'notebook', 'ppt', 'excel'] as const;

interface SemanticGraphViewProps {
  focusResourceId?: string;
}

/**
 * Pestaña de grafo semántico (D3 force); datos vía `window.electron.db.semantic`.
 */
export default function SemanticGraphView({ focusResourceId }: SemanticGraphViewProps) {
  const { t } = useTranslation();
  const openResourceTab = useTabStore((s) => s.openResourceTab);
  const [simThreshold, setSimThreshold] = useState(0.45);
  const [filterMode, setFilterMode] = useState<SemanticFilterMode>('all');
  const [hiddenResourceTypes, setHiddenResourceTypes] = useState<Set<string>>(() => new Set());
  const [data, setData] = useState<{ nodes: GraphNodeDatum[]; edges: GraphEdgeDatum[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(true);
  const [reindexBusy, setReindexBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [edgePanel, setEdgePanel] = useState<{
    edge: SemanticEdgePanelData;
    x: number;
    y: number;
  } | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const load = useCallback(async () => {
    if (!focusResourceId) {
      setData({ nodes: [], edges: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await window.electron.db.semantic.getGraph(focusResourceId, simThreshold);
      if (res.success && res.data) {
        setData({
          nodes: res.data.nodes as GraphNodeDatum[],
          edges: res.data.edges as GraphEdgeDatum[],
        });
      } else {
        setData({ nodes: [], edges: [] });
      }
    } catch {
      setData({ nodes: [], edges: [] });
    } finally {
      setLoading(false);
    }
  }, [focusResourceId, simThreshold]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = window.electron.db.semantic.onProgress((p) => {
      setProgress({ done: p.done ?? 0, total: p.total ?? 0 });
    });
    return off;
  }, []);

  const filteredEdgesByMode = useMemo(() => {
    return data.edges.filter((e) => {
      if (filterMode === 'auto') return e.relation_type === 'auto';
      if (filterMode === 'strong') return e.similarity >= 0.75;
      if (filterMode === 'confirmed') return e.relation_type === 'confirmed';
      return true;
    });
  }, [data.edges, filterMode]);

  const nodesAllowedByType = useMemo(() => {
    if (!focusResourceId) return new Set<string>();
    const allowed = new Set<string>();
    for (const n of data.nodes) {
      const rt = n.resourceType || 'note';
      if (n.id === focusResourceId || !hiddenResourceTypes.has(rt)) {
        allowed.add(n.id);
      }
    }
    return allowed;
  }, [data.nodes, focusResourceId, hiddenResourceTypes]);

  const filteredEdges = useMemo(() => {
    return filteredEdgesByMode.filter((e) => {
      const s = typeof e.source === 'string' ? e.source : (e.source as GraphNodeDatum).id;
      const t = typeof e.target === 'string' ? e.target : (e.target as GraphNodeDatum).id;
      return nodesAllowedByType.has(s) && nodesAllowedByType.has(t);
    });
  }, [filteredEdgesByMode, nodesAllowedByType]);

  const filteredNodes = useMemo(() => {
    if (!focusResourceId) return [];
    const ids = new Set<string>([focusResourceId]);
    for (const e of filteredEdges) {
      ids.add(typeof e.source === 'string' ? e.source : (e.source as GraphNodeDatum).id);
      ids.add(typeof e.target === 'string' ? e.target : (e.target as GraphNodeDatum).id);
    }
    return data.nodes.filter((n) => ids.has(n.id));
  }, [data.nodes, filteredEdges, focusResourceId]);

  const toggleResourceType = useCallback((rt: string) => {
    setHiddenResourceTypes((prev) => {
      const next = new Set(prev);
      if (next.has(rt)) next.delete(rt);
      else next.add(rt);
      return next;
    });
  }, []);

  const onEdgeClick = useCallback((edge: GraphEdgeDatum, clientX: number, clientY: number) => {
    setEdgePanel({
      edge: {
        id: edge.id,
        similarity: edge.similarity,
        relation_type: edge.relation_type,
        sourceName: edge.sourceName || edge.source,
        targetName: edge.targetName || edge.target,
        source: typeof edge.source === 'string' ? edge.source : edge.source,
        target: typeof edge.target === 'string' ? edge.target : edge.target,
      },
      x: Math.min(clientX, window.innerWidth - 340),
      y: Math.min(clientY, window.innerHeight - 280),
    });
  }, []);

  const onNodeDoubleClick = useCallback(
    (node: GraphNodeDatum) => {
      openResourceTab(node.id, node.resourceType || 'note', node.label);
    },
    [openResourceTab],
  );

  const onConfirm = useCallback(
    async (id: string) => {
      await window.electron.db.semantic.confirm(id);
      setEdgePanel(null);
      void load();
    },
    [load],
  );

  const onReject = useCallback(
    async (id: string) => {
      await window.electron.db.semantic.reject(id);
      setEdgePanel(null);
      void load();
    },
    [load],
  );

  const runReindexAll = useCallback(async () => {
    setReindexBusy(true);
    setProgress(null);
    try {
      await window.electron.db.semantic.reindexAll();
    } finally {
      setReindexBusy(false);
      setProgress(null);
      void load();
    }
  }, [load]);

  if (!focusResourceId) {
    return (
      <div className="flex flex-1 items-center justify-center p-6" style={{ background: 'var(--dome-bg)' }}>
        <HubListState variant="empty" title={t('semantic_graph.no_focus')} compact />
      </div>
    );
  }

  if (loading && data.nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ background: 'var(--dome-bg)' }}>
        <HubListState variant="loading" loadingLabel={t('common.loading')} compact />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col flex-1 min-h-0 h-full relative"
      style={{ background: 'var(--dome-bg)' }}
    >
      <div
        className="semantic-graph-toolbar shrink-0 flex flex-col gap-2.5 px-4 py-3 border-b"
        style={{ borderColor: 'var(--dome-border)' }}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'auto', 'strong', 'confirmed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className="text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors"
                style={{
                  borderColor: filterMode === f ? 'var(--dome-accent)' : 'var(--dome-border)',
                  background: filterMode === f ? 'var(--dome-accent-bg)' : 'transparent',
                  color: filterMode === f ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                }}
                onClick={() => setFilterMode(f)}
              >
                {t(`semantic_graph.filter_${f}`)}
              </button>
            ))}
          </div>
          <label
            className="flex items-center gap-2.5 text-[11px] min-w-0"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <span className="shrink-0 whitespace-nowrap">
              {t('semantic_graph.min_similarity')}: {simThreshold.toFixed(2)}
            </span>
            <input
              type="range"
              min={30}
              max={90}
              step={1}
              value={Math.round(simThreshold * 100)}
              onChange={(e) => setSimThreshold(Number(e.target.value) / 100)}
              className="semantic-graph-slider w-28 sm:w-36 min-w-[5rem]"
              aria-label={t('semantic_graph.min_similarity')}
            />
          </label>
          <button
            type="button"
            className="text-[11px] font-medium px-3 py-1.5 rounded-full border ml-auto inline-flex items-center gap-1.5 disabled:opacity-45 transition-colors"
            style={{
              borderColor: 'var(--dome-border)',
              background: 'transparent',
              color: 'var(--dome-text-secondary)',
            }}
            disabled={reindexBusy}
            onClick={() => void runReindexAll()}
            title={t('semantic_graph.reindex_all')}
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${reindexBusy ? 'animate-spin' : ''}`} />
            <span>{reindexBusy ? t('semantic_graph.indexing') : t('semantic_graph.reindex_all')}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('semantic_graph.resource_types')}>
          <span className="text-[11px] shrink-0" style={{ color: 'var(--dome-text-muted)' }}>
            {t('semantic_graph.resource_types')}
          </span>
          {GRAPH_RESOURCE_TYPES.map((rt) => {
            const hidden = hiddenResourceTypes.has(rt);
            return (
              <button
                key={rt}
                type="button"
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors capitalize"
                style={{
                  borderColor: 'var(--dome-border)',
                  background: hidden ? 'transparent' : 'var(--dome-accent-bg)',
                  color: hidden ? 'var(--dome-text-muted)' : 'var(--dome-text)',
                  opacity: hidden ? 0.5 : 1,
                }}
                onClick={() => toggleResourceType(rt)}
              >
                {rt}
              </button>
            );
          })}
        </div>
        <div className="border-t pt-2" style={{ borderColor: 'var(--dome-border)' }}>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[11px] font-medium w-full text-left py-0.5"
            style={{ color: 'var(--dome-text-muted)' }}
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((o) => !o)}
          >
            {legendOpen ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{t('semantic_graph.legend_heading')}</span>
            <span className="sr-only">{legendOpen ? t('semantic_graph.legend_collapse') : t('semantic_graph.legend_expand')}</span>
          </button>
          {legendOpen ? (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 list-none p-0 m-0">
              {GRAPH_RESOURCE_TYPES.map((rt) => (
                <li key={rt} className="flex items-center gap-1.5 text-[11px] capitalize" style={{ color: 'var(--dome-text-secondary)' }}>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 border"
                    style={{
                      background: SEMANTIC_RESOURCE_TYPE_FILL[rt] ?? 'var(--dome-bg-hover)',
                      borderColor: 'var(--dome-border)',
                    }}
                  />
                  {rt}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {progress && progress.total > 0 ? (
        <div className="px-4 py-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          {t('semantic_graph.reindex_progress', { done: progress.done, total: progress.total })}
        </div>
      ) : null}
      <div className="flex-1 min-h-0 relative">
        {filteredNodes.length > 0 ? (
          <SemanticGraphCanvas
            nodes={filteredNodes}
            edges={filteredEdges}
            onEdgeClick={onEdgeClick}
            onNodeDoubleClick={onNodeDoubleClick}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <HubListState variant="empty" title={t('semantic_graph.empty')} compact />
          </div>
        )}
      </div>
      {edgePanel ? (
        <EdgeConfirmPanel
          edge={edgePanel.edge}
          position={{ x: edgePanel.x, y: edgePanel.y }}
          onConfirm={onConfirm}
          onReject={onReject}
          onClose={() => setEdgePanel(null)}
        />
      ) : null}
    </div>
  );
}
