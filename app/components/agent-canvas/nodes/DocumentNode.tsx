'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  File02Icon as FileTextIcon,
  ChevronDownIcon as ChevronDownIcon,
  Search01Icon as SearchIcon,
  Cancel01Icon as XIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { DocumentNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

interface ResourceOption {
  id: string;
  title: string;
  type: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

const ALLOWED_RESOURCE_TYPES = new Set(['pdf', 'url']);

export default function DocumentNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: DocumentNodeData;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const updateNode = useCanvasStore((s) => s.updateNode);
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState<ResourceOption[]>([]);

  const openPicker = async () => {
    setShowPicker(true);
    try {
      const result = await window.electron?.invoke('db:resources:getAll');
      const resourcesList = Array.isArray(result) ? result : result?.data;
      if (Array.isArray(resourcesList)) {
        const mapped: ResourceOption[] = [];
        for (const r of resourcesList as ResourceOption[]) {
          if (!ALLOWED_RESOURCE_TYPES.has(r.type)) continue;
          mapped.push({
            id: r.id,
            title: r.title,
            type: r.type,
            content: r.content,
            metadata: r.metadata,
          });
        }
        setResources(mapped);
      }
    } catch {
      /* no resources */
    }
  };

  const selectResource = (resource: ResourceOption) => {
    updateNode(id, {
      resourceId: resource.id,
      resourceType: resource.type,
      resourceTitle: resource.title,
      resourceContent: resource.content ?? null,
      resourceMetadata: resource.metadata ?? null,
    } as Partial<DocumentNodeData>);
    setShowPicker(false);
    setQuery('');
  };

  const clearResource = () => {
    updateNode(id, {
      resourceId: null,
      resourceType: null,
      resourceTitle: null,
      resourceContent: null,
      resourceMetadata: null,
    } as Partial<DocumentNodeData>);
  };

  const filtered = resources.filter(
    (r) =>
      !query ||
      r.title.toLowerCase().includes(query.toLowerCase()) ||
      r.type.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      className="wf-node-card workflow-node-card rounded-xl overflow-visible transition-[box-shadow,border-color]"
      style={{
        width: 220,
        border: `1px solid ${selected ? 'var(--success)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--success) 18%, transparent)' : 'none',
        background: 'var(--card)',
        position: 'relative',
      }}
    >
      <div
        className="workflow-node-header flex items-center gap-2 px-3 py-2"
        style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="size-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--success)' }}
        >
          <HugeiconsIcon icon={FileTextIcon} className="size-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold leading-tight truncate text-foreground">
          {data.label}
        </span>
      </div>

      <div className="p-3">
        {data.resourceId ? (
          <div
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
          >
            <HugeiconsIcon icon={FileTextIcon} className="size-3.5 shrink-0 text-[var(--success)]" />
            <span className="flex-1 text-xs truncate text-foreground">
              {data.resourceTitle}
            </span>
            <button
              type="button"
              onClick={clearResource}
              className="nodrag size-7 rounded-md flex items-center justify-center hover:opacity-70 transition-opacity text-muted-foreground"
            >
              <HugeiconsIcon icon={XIcon} className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openPicker}
            className="nodrag w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-opacity hover:opacity-90"
            style={{
              background: 'var(--background)',
              border: '1px dashed var(--border)',
              color: 'var(--muted-foreground)',
            }}
          >
            <HugeiconsIcon icon={SearchIcon} className="size-3.5 shrink-0" />
            <span className="truncate">{t('canvas.select_document')}</span>
            <HugeiconsIcon icon={ChevronDownIcon} className="size-3.5 ml-auto shrink-0" />
          </button>
        )}
      </div>

      {showPicker && (
        <div
          className="nodrag absolute z-50 left-0 right-0 rounded-xl overflow-hidden"
          style={{
            top: 'calc(100% + 4px)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            maxHeight: 240,
            boxShadow: '0 8px 24px color-mix(in srgb, var(--foreground) 8%, transparent)',
          }}
        >
          <div className="p-2 border-b border-border">
            <div className="relative">
              <HugeiconsIcon icon={SearchIcon}
                className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
              />
              <input
                type="text"
                placeholder={t('canvas.picker_search')}
                aria-label={t('canvas.picker_search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="nodrag w-full pl-8 pr-2 py-2 text-xs rounded-lg outline-none"
                style={{
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border)',
                }}
              />
            </div>
          </div>
          <div className="nodrag nowheel overflow-y-auto" style={{ maxHeight: 180 }}>
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-xs text-muted-foreground">
                {t('canvas.no_documents_in_library')}
              </p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectResource(r)}
                  className="nodrag w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in srgb, var(--primary) 12%, transparent)]"
                >
                  <HugeiconsIcon icon={FileTextIcon} className="size-4 shrink-0 text-[var(--success)]" />
                  <span className="flex-1 text-xs truncate text-foreground">
                    {r.title}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-md"
                    style={{ background: 'var(--background)', color: 'var(--muted-foreground)' }}
                  >
                    {r.type}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-border">
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="nodrag w-full text-xs py-1.5 rounded-md transition-colors hover:opacity-70"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
