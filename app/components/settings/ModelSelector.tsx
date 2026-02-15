import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, CheckCircle2, Gift, Shield, Brain, ImageIcon } from 'lucide-react';
import type { ModelDefinition } from '@/lib/ai/models';

interface ModelSelectorProps {
  models: ModelDefinition[];
  selectedModelId: string;
  onChange: (modelId: string) => void;
  showBadges?: boolean;
  showDescription?: boolean;
  showContextWindow?: boolean;
  isFreeProvider?: boolean;
  isPrivateProvider?: boolean;
  searchable?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  providerType?: 'cloud' | 'ollama' | 'embedding';
}

export default function ModelSelector({
  models,
  selectedModelId,
  onChange,
  showBadges = true,
  showDescription = true,
  showContextWindow = true,
  isFreeProvider = false,
  isPrivateProvider = false,
  searchable = true,
  placeholder = 'Selecciona un modelo...',
  emptyMessage = 'No hay modelos disponibles',
  disabled = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId]
  );

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q)
    );
  }, [models, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const formatContextWindow = (ctx: number): string => {
    if (ctx === 0) return '';
    if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
    if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
    return String(ctx);
  };

  const renderBadges = (model: ModelDefinition) => {
    if (!showBadges) return null;
    const badges: JSX.Element[] = [];
    if (model.recommended) badges.push(<span key="rec" className="model-badge recommended">Recommended</span>);
    if (isFreeProvider) badges.push(<span key="free" className="model-badge free inline-flex items-center gap-1"><Gift size={10} />Free</span>);
    if (isPrivateProvider) badges.push(<span key="priv" className="model-badge private inline-flex items-center gap-1"><Shield size={10} />Private</span>);
    if (model.reasoning) badges.push(<span key="reason" className="model-badge reasoning inline-flex items-center gap-1"><Brain size={10} />Reasoning</span>);
    if (model.input?.includes('image')) badges.push(<span key="vision" className="model-badge vision inline-flex items-center gap-1"><ImageIcon size={10} />Vision</span>);
    return badges.length ? <>{badges}</> : null;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-left border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: isOpen ? 'var(--accent)' : 'var(--border)',
        }}
      >
        <div className="flex-1 min-w-0">
          {selectedModel ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                  {selectedModel.name}
                </span>
                {renderBadges(selectedModel)}
              </div>
              {showDescription && selectedModel.description && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs truncate" style={{ color: 'var(--secondary-text)' }}>{selectedModel.description}</span>
                  {showContextWindow && selectedModel.contextWindow > 0 && (
                    <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--secondary-text)' }}>
                      {formatContextWindow(selectedModel.contextWindow)} ctx
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <span className="text-sm" style={{ color: 'var(--tertiary-text)' }}>{placeholder}</span>
          )}
        </div>
        <ChevronDown size={18} style={{ color: 'var(--secondary-text)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-[600] rounded-xl border overflow-hidden shadow-lg"
          style={{
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
          }}
        >
          {searchable && (
            <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--tertiary-text)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar modelos..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filteredModels.length === 0 ? (
              <div className="p-4 text-center text-sm" style={{ color: 'var(--secondary-text)' }}>
                {searchQuery ? `No se encontraron modelos con "${searchQuery}"` : emptyMessage}
              </div>
            ) : (
              filteredModels.map((model) => {
                const sel = model.id === selectedModelId;
                return (
                  <button
                    key={model.id}
                    role="option"
                    aria-selected={sel}
                    type="button"
                    onClick={() => {
                      onChange(model.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)] cursor-pointer"
                    style={{
                      backgroundColor: sel ? 'var(--bg-tertiary)' : 'transparent',
                      borderLeft: sel ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    <div className="flex items-center min-w-0 flex-1 gap-2">
                      {sel && <CheckCircle2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>{model.name}</span>
                          {renderBadges(model)}
                        </div>
                        {showDescription && model.description && (
                          <span className="text-xs block truncate mt-0.5" style={{ color: 'var(--secondary-text)' }}>{model.description}</span>
                        )}
                      </div>
                    </div>
                    {showContextWindow && model.contextWindow > 0 && (
                      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--secondary-text)' }}>
                        {formatContextWindow(model.contextWindow)}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
