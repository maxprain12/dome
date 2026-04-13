import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { ChevronDown, Search, CheckCircle2, Gift, Shield, Brain, ImageIcon } from 'lucide-react';
import type { ModelDefinition } from '@/lib/ai/models';
import { cn } from '@/lib/utils';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeListRow from '@/components/ui/DomeListRow';

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
    [models, selectedModelId],
  );

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q),
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
    const nodes: ReactNode[] = [];
    if (model.recommended) {
      nodes.push(<DomeBadge key="rec" label="Recommended" variant="soft" color="var(--accent)" size="xs" />);
    }
    if (isFreeProvider) {
      nodes.push(
        <span key="free" className="inline-flex items-center gap-0.5">
          <Gift size={10} className="shrink-0 text-[var(--accent)]" aria-hidden />
          <DomeBadge label="Free" variant="soft" color="var(--accent)" size="xs" />
        </span>,
      );
    }
    if (isPrivateProvider) {
      nodes.push(
        <span key="priv" className="inline-flex items-center gap-0.5">
          <Shield size={10} className="shrink-0 text-[var(--secondary-text)]" aria-hidden />
          <DomeBadge label="Private" variant="soft" color="var(--secondary-text)" size="xs" />
        </span>,
      );
    }
    if (model.reasoning) {
      nodes.push(
        <span key="reason" className="inline-flex items-center gap-0.5">
          <Brain size={10} className="shrink-0 text-[var(--accent)]" aria-hidden />
          <DomeBadge label="Reasoning" variant="soft" color="var(--accent)" size="xs" />
        </span>,
      );
    }
    if (model.input?.includes('image')) {
      nodes.push(
        <span key="vision" className="inline-flex items-center gap-0.5">
          <ImageIcon size={10} className="shrink-0 text-[var(--accent)]" aria-hidden />
          <DomeBadge label="Vision" variant="soft" color="var(--accent)" size="xs" />
        </span>,
      );
    }
    return nodes.length ? <span className="flex flex-wrap items-center gap-1.5">{nodes}</span> : null;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <DomeButton
        type="button"
        variant="outline"
        size="md"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'w-full justify-between gap-3 px-4 py-3 h-auto min-h-0 rounded-lg text-left font-normal',
          'bg-[var(--bg-secondary)]',
          isOpen && 'ring-2 ring-[var(--accent)] border-[var(--accent)]',
        )}
        rightIcon={
          <ChevronDown
            size={18}
            className="shrink-0 text-[var(--secondary-text)] transition-transform"
            style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
            aria-hidden
          />
        }
      >
        <div className="flex-1 min-w-0 text-left">
          {selectedModel ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate text-[var(--primary-text)]">{selectedModel.name}</span>
                {renderBadges(selectedModel)}
              </div>
              {showDescription && selectedModel.description && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs truncate text-[var(--secondary-text)]">{selectedModel.description}</span>
                  {showContextWindow && selectedModel.contextWindow > 0 && (
                    <span className="text-xs tabular-nums shrink-0 text-[var(--secondary-text)]">
                      {formatContextWindow(selectedModel.contextWindow)} ctx
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <span className="text-sm text-[var(--tertiary-text)]">{placeholder}</span>
          )}
        </div>
      </DomeButton>

      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-[600] rounded-xl border overflow-hidden shadow-lg bg-[var(--bg)] border-[var(--border)]"
        >
          {searchable && (
            <div className="p-2 border-b border-[var(--border)]">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 text-[var(--tertiary-text)]"
                  aria-hidden
                />
                <DomeInput
                  className="gap-0"
                  inputClassName="pl-9"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar modelos..."
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filteredModels.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--secondary-text)]">
                {searchQuery ? `No se encontraron modelos con "${searchQuery}"` : emptyMessage}
              </div>
            ) : (
              filteredModels.map((model) => {
                const sel = model.id === selectedModelId;
                return (
                  <DomeListRow
                    key={model.id}
                    rowButtonProps={{ role: 'option', 'aria-selected': sel }}
                    icon={
                      sel ? <CheckCircle2 size={16} className="text-[var(--accent)] shrink-0" aria-hidden /> : undefined
                    }
                    title={
                      <span className="flex items-center flex-wrap gap-x-2 gap-y-1">
                        <span>{model.name}</span>
                        {renderBadges(model)}
                      </span>
                    }
                    subtitle={
                      showDescription && model.description ? (
                        <span className="truncate">{model.description}</span>
                      ) : undefined
                    }
                    meta={
                      showContextWindow && model.contextWindow > 0 ? (
                        <span className="tabular-nums">{formatContextWindow(model.contextWindow)}</span>
                      ) : undefined
                    }
                    onClick={() => {
                      onChange(model.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={cn(
                      'rounded-none border-l-[3px] border-transparent px-3 py-2.5',
                      sel && 'bg-[var(--bg-tertiary)] border-l-[var(--accent)]',
                    )}
                  />
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
