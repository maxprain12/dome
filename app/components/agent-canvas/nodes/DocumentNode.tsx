'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { FileText, ChevronDown, Search, X } from 'lucide-react';
import type { DocumentNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

interface ResourceOption {
  id: string;
  title: string;
  type: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export default function DocumentNode({ id, data, selected }: NodeProps<DocumentNodeData>) {
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
        setResources(
          resourcesList
            .filter((r: ResourceOption) => ['note', 'pdf', 'document', 'url'].includes(r.type))
            .map((r: ResourceOption) => ({
              id: r.id,
              title: r.title,
              type: r.type,
              content: r.content,
              metadata: r.metadata,
            }))
        );
      }
    } catch {
      // No resources available
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
      r.type.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="workflow-node-card rounded-lg overflow-visible transition-colors"
      style={{
        width: 220,
        border: `1px solid ${selected ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
        position: 'relative',
      }}
    >
      <div className="workflow-node-header flex items-center gap-1.5 px-2 py-1.5">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ background: 'var(--success)' }}
        >
          <FileText className="w-3 h-3 text-white" />
        </div>
        <span className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--dome-text)' }}>
          {data.label}
        </span>
      </div>

      {/* Content */}
      <div className="p-2">
        {data.resourceId ? (
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
          >
            <FileText className="w-3 h-3 shrink-0" style={{ color: 'var(--success)' }} />
            <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--dome-text)' }}>
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
            className="nodrag w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] transition-all hover:opacity-80"
            style={{
              background: 'var(--dome-bg)',
              border: '1px dashed var(--dome-border)',
              color: 'var(--dome-text-muted)',
            }}
          >
            <Search className="w-3 h-3 shrink-0" />
            <span className="truncate">{t('canvas.select_document')}</span>
            <ChevronDown className="w-3 h-3 ml-auto shrink-0" />
          </button>
        )}
      </div>

      {/* Resource picker dropdown */}
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
                placeholder={t('canvas.picker_search')}
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
          <div className="nodrag nowheel overflow-y-auto" style={{ maxHeight: 180 }}>
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {t('canvas.no_documents_in_library')}
              </p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selectResource(r)}
                  className="nodrag w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--dome-accent-bg)]"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--success)' }} />
                  <span className="flex-1 text-xs truncate" style={{ color: 'var(--dome-text)' }}>
                    {r.title}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--dome-bg)', color: 'var(--dome-text-muted)' }}
                  >
                    {r.type}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
            <button
              onClick={() => setShowPicker(false)}
              className="nodrag w-full text-xs py-1 rounded transition-colors hover:opacity-70"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="workflow-node-handle"
        style={{ background: 'var(--success)' }}
      />
    </div>
  );
}
