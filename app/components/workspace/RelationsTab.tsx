import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Share2 } from 'lucide-react';
import MentionHeaderInput from './MentionHeaderInput';
import RelationChip from './RelationChip';
import { useTabStore } from '@/lib/store/useTabStore';

interface TagRow {
  id: string;
  name: string;
  color?: string | null;
}

interface OutEdgeRow {
  id: string;
  target_id: string;
  target_title: string;
  target_type: string;
  similarity: number;
  relation_type: string;
}

export default function RelationsTab({ resourceId }: { resourceId: string }) {
  const { t } = useTranslation();
  const openSemanticGraphTab = useTabStore((s) => s.openSemanticGraphTab);
  const [outRows, setOutRows] = useState<OutEdgeRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingEdgeId, setRemovingEdgeId] = useState<string | null>(null);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [gr, tr] = await Promise.all([
        window.electron.db.semantic.getGraph(resourceId, 0),
        window.electron.db.tags.getByResource(resourceId),
      ]);

      const edges =
        gr.success && gr.data?.edges
          ? (gr.data.edges as Array<{
              id: string;
              source: string;
              target: string;
              similarity: number;
              relation_type: string;
              targetName?: string;
              targetType?: string;
            }>)
          : [];

      const outgoing = edges.filter(
        (e) => e.source === resourceId && e.relation_type !== 'rejected',
      );

      const byTarget = new Map<string, (typeof outgoing)[0]>();
      for (const e of outgoing) {
        const prev = byTarget.get(e.target);
        if (!prev || e.similarity > prev.similarity) {
          byTarget.set(e.target, e);
        }
      }

      const rows: OutEdgeRow[] = [...byTarget.values()].map((e) => ({
        id: e.id,
        target_id: e.target,
        target_title: e.targetName || e.target,
        target_type: e.targetType || 'note',
        similarity: e.similarity,
        relation_type: e.relation_type,
      }));

      setOutRows(rows);

      if (tr.success && Array.isArray(tr.data)) {
        setTags(tr.data as TagRow[]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    setLoading(true);
    void loadAll();
  }, [loadAll]);

  const { mentionRows, webRows } = useMemo(() => {
    const mentions: OutEdgeRow[] = [];
    const webs: OutEdgeRow[] = [];
    for (const r of outRows) {
      if (r.target_type === 'url') webs.push(r);
      else mentions.push(r);
    }
    return { mentionRows: mentions, webRows: webs };
  }, [outRows]);

  const openResource = (id: string, type: string) => {
    window.electron.workspace.open(id, type);
  };

  const removeEdge = async (edgeId: string) => {
    setRemovingEdgeId(edgeId);
    try {
      await window.electron.db.semantic.delete(edgeId);
      setOutRows((prev) => prev.filter((r) => r.id !== edgeId));
    } finally {
      setRemovingEdgeId(null);
    }
  };

  const removeTag = async (tagId: string) => {
    setRemovingTagId(tagId);
    try {
      await window.electron.db.tags.removeFromResource(resourceId, tagId);
      setTags((prev) => prev.filter((x) => x.id !== tagId));
    } finally {
      setRemovingTagId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div
          className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full"
          style={{ color: 'var(--dome-text-muted)' }}
        />
      </div>
    );
  }

  const empty =
    tags.length === 0 && mentionRows.length === 0 && webRows.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 border-b shrink-0" style={{ borderColor: 'var(--dome-border)' }}>
        <button
          type="button"
          className="mb-3 w-full flex items-center justify-center gap-2 text-xs font-medium py-2 px-3 rounded-lg border transition-colors"
          style={{
            borderColor: 'var(--dome-border)',
            background: 'var(--dome-surface)',
            color: 'var(--dome-text)',
          }}
          onClick={() => openSemanticGraphTab(resourceId)}
        >
          <Share2 size={14} />
          {t('workspace.relations_open_graph')}
        </button>
        <MentionHeaderInput resourceId={resourceId} onLinked={loadAll} onTagged={loadAll} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {empty ? (
          <div className="text-center py-8">
            <Link2 size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--dome-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {t('workspace.relations_empty')}
            </p>
          </div>
        ) : null}

        {tags.length > 0 ? (
          <section>
            <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
              {t('workspace.relations_tags')}
            </h4>
            <div className="space-y-2">
              {tags.map((tag) => (
                <RelationChip
                  key={tag.id}
                  variant="tag"
                  title={tag.name}
                  accentColor={tag.color ?? undefined}
                  onRemove={() => void removeTag(tag.id)}
                  removeDisabled={removingTagId === tag.id}
                />
              ))}
            </div>
          </section>
        ) : null}

        {mentionRows.length > 0 ? (
          <section>
            <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
              {t('workspace.relations_mentions')}
            </h4>
            <div className="space-y-2">
              {mentionRows.map((row) => (
                <RelationChip
                  key={row.id}
                  variant="mention"
                  title={row.target_title || 'Untitled'}
                  resourceType={row.target_type}
                  similarity={row.similarity}
                  relationState={row.relation_type}
                  onOpen={() => openResource(row.target_id, row.target_type || 'note')}
                  onRemove={() => void removeEdge(row.id)}
                  removeDisabled={removingEdgeId === row.id}
                />
              ))}
            </div>
          </section>
        ) : null}

        {webRows.length > 0 ? (
          <section>
            <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
              {t('workspace.relations_web_links')}
            </h4>
            <div className="space-y-2">
              {webRows.map((row) => (
                <RelationChip
                  key={row.id}
                  variant="url"
                  title={row.target_title || row.target_id}
                  subtitle="URL"
                  resourceType="url"
                  similarity={row.similarity}
                  relationState={row.relation_type}
                  onOpen={() => openResource(row.target_id, 'url')}
                  onRemove={() => void removeEdge(row.id)}
                  removeDisabled={removingEdgeId === row.id}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
