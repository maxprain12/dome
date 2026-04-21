'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ChevronDown, Search, X } from 'lucide-react';
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
        setResources(
          resourcesList
            .filter((r: ImageResource) => r.type === 'image')
            .map((r: ImageResource) => ({
              id: r.id,
              title: r.title,
              type: r.type,
              internal_path: r.internal_path,
              thumbnail_data: r.thumbnail_data,
              metadata: r.metadata,
            })),
        );
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
        border: `1px solid ${selected ? 'var(--warning)' : 'var(--dome-border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--warning) 18%, transparent)' : 'none',
        background: 'var(--dome-surface)',
        position: 'relative',
      }}
    >
      <div
        className="workflow-node-header flex items-center gap-2 px-3 py-2"
        style={{ background: 'var(--dome-bg)', borderBottom: '1px solid var(--dome-border)' }}
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--warning)' }}
        >
          <Image className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold leading-tight truncate" style={{ color: 'var(--dome-text)' }}>
          {data.label}
        </span>
      </div>

      <div className="p-3">
        {data.resourceId ? (
          <div
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
          >
            {data.resourceUrl ? (
              <img src={data.resourceUrl} alt={data.resourceTitle ?? ''} className="w-8 h-8 object-cover rounded-md" />
            ) : (
              <Image className="w-4 h-4 shrink-0" style={{ color: 'var(--warning)' }} />
            )}
            <span className="flex-1 text-xs truncate" style={{ color: 'var(--dome-text)' }}>
              {data.resourceTitle}
            </span>
            <button
              type="button"
              onClick={clearResource}
              className="nodrag w-7 h-7 rounded-md flex items-center justify-center hover:opacity-70 transition-opacity"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openPicker}
            className="nodrag w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all hover:opacity-90"
            style={{
              background: 'var(--dome-bg)',
              border: '1px dashed var(--dome-border)',
              color: 'var(--dome-text-muted)',
            }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('canvas.select_image')}</span>
            <ChevronDown className="w-3.5 h-3.5 ml-auto shrink-0" />
          </button>
        )}
      </div>

      {showPicker && (
        <div
          className="nodrag absolute z-50 left-0 right-0 rounded-xl overflow-hidden"
          style={{
            top: 'calc(100% + 4px)',
            background: 'var(--dome-surface)',
            border: '1px solid var(--dome-border)',
            maxHeight: 240,
            boxShadow: '0 8px 24px color-mix(in srgb, var(--dome-text) 8%, transparent)',
          }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--dome-border)' }}>
            <div className="relative">
              <Search
                className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: 'var(--dome-text-muted)' }}
              />
              <input
                autoFocus
                type="text"
                placeholder={t('canvas.picker_search_images')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="nodrag w-full pl-8 pr-2 py-2 text-xs rounded-lg outline-none"
                style={{
                  background: 'var(--dome-bg)',
                  color: 'var(--dome-text)',
                  border: '1px solid var(--dome-border)',
                }}
              />
            </div>
          </div>
          <div className="nodrag nowheel overflow-y-auto p-2" style={{ maxHeight: 160 }}>
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {t('canvas.no_images_in_library')}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectResource(r)}
                    className="nodrag aspect-square rounded-lg overflow-hidden border transition-all hover:border-[var(--dome-accent)]"
                    style={{ border: '1px solid var(--dome-border)' }}
                    title={r.title}
                  >
                    {r.thumbnail_data ? (
                      <img src={r.thumbnail_data} alt={r.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--dome-bg)' }}>
                        <Image className="w-5 h-5" style={{ color: 'var(--dome-text-muted)' }} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="nodrag w-full text-xs py-1.5 rounded-md transition-colors hover:opacity-70"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
