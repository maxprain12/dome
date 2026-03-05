'use client';

import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
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

export default function ImageNode({ id, data, selected }: NodeProps<ImageNodeData>) {
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
            }))
        );
      }
    } catch {
      // No resources available
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

  const filtered = resources.filter(
    (r) => !query || r.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="rounded-xl shadow-sm overflow-visible transition-all"
      style={{
        width: 260,
        background: 'var(--dome-surface)',
        border: `1.5px solid ${selected ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
        boxShadow: selected ? '0 0 0 3px var(--dome-accent-bg)' : '0 2px 8px rgba(0,0,0,0.06)',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{
          background: 'var(--warning-bg)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'var(--warning)' }}
        >
          <Image className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
          {data.label}
        </span>
      </div>

      {/* Content */}
      <div className="p-3">
        {data.resourceId ? (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
          >
            {data.resourceUrl ? (
              <img
                src={data.resourceUrl}
                alt={data.resourceTitle ?? ''}
                className="w-8 h-8 object-cover rounded"
              />
            ) : (
              <Image className="w-4 h-4 shrink-0" style={{ color: 'var(--warning)' }} />
            )}
            <span className="flex-1 text-xs truncate" style={{ color: 'var(--dome-text)' }}>
              {data.resourceTitle}
            </span>
            <button
              onClick={clearResource}
              className="nodrag w-4 h-4 rounded flex items-center justify-center hover:opacity-70 transition-opacity"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={openPicker}
            className="nodrag w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all hover:opacity-80"
            style={{
              background: 'var(--dome-bg)',
              border: '1px dashed var(--dome-border)',
              color: 'var(--dome-text-muted)',
            }}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Seleccionar imagen...</span>
            <ChevronDown className="w-3 h-3 ml-auto" />
          </button>
        )}
      </div>

      {/* Image picker dropdown */}
      {showPicker && (
        <div
          className="nodrag absolute z-50 left-0 right-0 rounded-xl shadow-xl overflow-hidden"
          style={{
            top: 'calc(100% + 4px)',
            background: 'var(--dome-surface)',
            border: '1px solid var(--dome-border)',
            maxHeight: 240,
          }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--dome-border)' }}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
              <input
                autoFocus
                type="text"
                placeholder="Buscar imagen..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="nodrag w-full pl-6 pr-2 py-1.5 text-xs rounded-lg outline-none"
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
                No hay imágenes en tu biblioteca
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => selectResource(r)}
                    className="nodrag aspect-square rounded-lg overflow-hidden border transition-all hover:border-[var(--dome-accent)]"
                    style={{ border: '1px solid var(--dome-border)' }}
                    title={r.title}
                  >
                    {r.thumbnail_data ? (
                      <img src={r.thumbnail_data} alt={r.title} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: 'var(--dome-bg)' }}
                      >
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
              onClick={() => setShowPicker(false)}
              className="nodrag w-full text-xs py-1 rounded transition-colors hover:opacity-70"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 10,
          height: 10,
          background: 'var(--warning)',
          border: '2px solid white',
          boxShadow: '0 0 0 1px var(--warning)',
        }}
      />
    </div>
  );
}
