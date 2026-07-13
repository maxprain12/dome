'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image01Icon as ImageIcon,
  ChevronDownIcon as ChevronDownIcon,
  Search01Icon as SearchIcon,
  Cancel01Icon as XIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ImageNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

interface ImageResource {
  id: string;
  title: string;
  type: string;
  internal_path?: string;
  thumbnail_data?: string;
  metadata?: Record<string, unknown>;
}

export default function ImageNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: ImageNodeData;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const updateNode = useCanvasStore((s) => s.updateNode);
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState<ImageResource[]>([]);

  const openPicker = async () => {
    setShowPicker(true);
    try {
      const result = await window.electron?.invoke('db:resources:getAll');
      const resourcesList = Array.isArray(result) ? result : result?.data;
      if (Array.isArray(resourcesList)) {
        const mapped: ImageResource[] = [];
        for (const r of resourcesList as ImageResource[]) {
          if (r.type !== 'image') continue;
          mapped.push({
            id: r.id,
            title: r.title,
            type: r.type,
            internal_path: r.internal_path,
            thumbnail_data: r.thumbnail_data,
            metadata: r.metadata,
          });
        }
        setResources(mapped);
      }
    } catch {
      /* no resources */
    }
  };

  const selectResource = (resource: ImageResource) => {
    updateNode(id, {
      resourceId: resource.id,
      resourceType: resource.type,
      resourceTitle: resource.title,
      resourceUrl: resource.thumbnail_data ?? null,
      resourceMetadata: resource.metadata ?? null,
    } as Partial<ImageNodeData>);
    setShowPicker(false);
    setQuery('');
  };

  const clearResource = () => {
    updateNode(id, {
      resourceId: null,
      resourceType: null,
      resourceTitle: null,
      resourceUrl: null,
      resourceMetadata: null,
    } as Partial<ImageNodeData>);
  };

  const filtered = resources.filter((r) => !query || r.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      className="wf-node-card workflow-node-card rounded-xl overflow-visible transition-[box-shadow,border-color]"
      style={{
        width: 220,
        border: `1px solid ${selected ? 'var(--warning)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--warning) 18%, transparent)' : 'none',
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
          style={{ background: 'var(--warning)' }}
        >
          <HugeiconsIcon icon={ImageIcon} className="size-3.5 text-white" />
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
            {data.resourceUrl ? (
              <img src={data.resourceUrl} alt={data.resourceTitle ?? ''} className="size-8 object-cover rounded-md" />
            ) : (
              <HugeiconsIcon icon={ImageIcon} className="size-4 shrink-0 text-[var(--warning)]" />
            )}
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
            className="nodrag w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all hover:opacity-90"
            style={{
              background: 'var(--background)',
              border: '1px dashed var(--border)',
              color: 'var(--muted-foreground)',
            }}
          >
            <HugeiconsIcon icon={SearchIcon} className="size-3.5 shrink-0" />
            <span className="truncate">{t('canvas.select_image')}</span>
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
                placeholder={t('canvas.picker_search_images')}
                aria-label={t('canvas.picker_search_images')}
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
          <div className="nodrag nowheel overflow-y-auto p-2" style={{ maxHeight: 160 }}>
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-xs text-muted-foreground">
                {t('canvas.no_images_in_library')}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectResource(r)}
                    className="nodrag aspect-square rounded-lg overflow-hidden border transition-all hover:border-primary"
                    style={{ border: '1px solid var(--border)' }}
                    title={r.title}
                  >
                    {r.thumbnail_data ? (
                      <img src={r.thumbnail_data} alt={r.title} className="size-full object-cover" />
                    ) : (
                      <div className="size-full flex items-center justify-center bg-background">
                        <HugeiconsIcon icon={ImageIcon} className="size-5 text-muted-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
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
