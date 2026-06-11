import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, ChevronDown, Search, Check, Gift, Shield, Brain, ImageIcon } from 'lucide-react';
import type { ModelDefinition } from '@/lib/ai/models';
import { cn } from '@/lib/utils';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput } from '@/components/ui/DomeInput';

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
  /** Provider id shown as a `[provider]` badge on each row + trigger. */
  providerId?: string;
  /** Show the hint "only models from configured providers". */
  configuredHint?: boolean;
}

export default function ModelSelector({
  models,
  selectedModelId,
  onChange,
  showBadges = true,
  showContextWindow = true,
  isFreeProvider = false,
  isPrivateProvider = false,
  searchable = true,
  placeholder = 'Selecciona un modelo...',
  emptyMessage = 'No hay modelos disponibles',
  disabled = false,
  providerId,
  configuredHint = false,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId],
  );

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (providerId ?? '').toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q),
    );
  }, [models, searchQuery, providerId]);

  // When opening (or the list changes), highlight the currently-selected model.
  useEffect(() => {
    if (!isOpen) return;
    const idx = filteredModels.findIndex((m) => m.id === selectedModelId);
    setHighlightedIndex(idx >= 0 ? idx : 0);
    const raf = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep the highlight in range and scrolled into view.
  useEffect(() => {
    if (!isOpen) return;
    setHighlightedIndex((i) => Math.min(i, Math.max(0, filteredModels.length - 1)));
  }, [filteredModels.length, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    rowRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

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

  const commitSelection = useCallback(
    (model: ModelDefinition | undefined) => {
      if (!model) return;
      onChange(model.id);
      setIsOpen(false);
      setSearchQuery('');
    },
    [onChange],
  );

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredModels.length === 0) return;
        setHighlightedIndex((i) => (i >= filteredModels.length - 1 ? 0 : i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredModels.length === 0) return;
        setHighlightedIndex((i) => (i <= 0 ? filteredModels.length - 1 : i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commitSelection(filteredModels[highlightedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
      }
    },
    [filteredModels, highlightedIndex, commitSelection],
  );

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
    if (model.input?.includes('video')) {
      nodes.push(
        <span key="video" className="inline-flex items-center gap-0.5">
          <Film size={10} className="shrink-0 text-[var(--accent)]" aria-hidden />
          <DomeBadge label="Video" variant="soft" color="var(--accent)" size="xs" />
        </span>,
      );
    }
    return nodes.length ? <span className="flex flex-wrap items-center gap-1.5">{nodes}</span> : null;
  };

  /** `[provider]` badge on each model row. */
  const providerBadge = (extraClass = '') =>
    providerId ? (
      <span
        className={cn('font-mono text-[11px] shrink-0 text-[var(--tertiary-text)]', extraClass)}
      >
        [{providerId}]
      </span>
    ) : null;

  // Model whose details are shown in the footer (the keyboard-highlighted row).
  const footerModel = isOpen ? filteredModels[highlightedIndex] : undefined;

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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium truncate text-[var(--primary-text)]">
                {selectedModel.id}
              </span>
              {providerBadge()}
              {renderBadges(selectedModel)}
            </div>
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
          {configuredHint && (
            <div className="px-3 pt-2.5 pb-1.5 text-[11px] leading-snug text-[var(--tertiary-text)]">
              {t('settings.ai.models_configured_only')}
            </div>
          )}
          {searchable && (
            <div className="p-2 border-b border-[var(--border)]">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 text-[var(--tertiary-text)]"
                  aria-hidden
                />
                <DomeInput
                  ref={searchInputRef}
                  className="gap-0"
                  inputClassName="pl-9 font-mono"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleListKeyDown}
                  placeholder={t('settings.ai.search_models')}
                />
              </div>
            </div>
          )}
          <div ref={listRef} role="listbox" tabIndex={-1} className="max-h-60 overflow-y-auto py-1" onKeyDown={handleListKeyDown}>
            {filteredModels.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--secondary-text)]">
                {searchQuery ? t('settings.ai.no_models_found', { query: searchQuery }) : emptyMessage}
              </div>
            ) : (
              filteredModels.map((model, idx) => {
                const isCurrent = model.id === selectedModelId;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={model.id}
                    ref={(el) => { rowRefs.current[idx] = el; }}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => commitSelection(model)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                      isHighlighted ? 'bg-[var(--bg-tertiary)]' : 'bg-transparent',
                    )}
                  >
                    <span
                      className={cn(
                        'w-3 shrink-0 text-center',
                        isHighlighted ? 'text-[var(--accent)]' : 'text-transparent',
                      )}
                      aria-hidden
                    >
                      →
                    </span>
                    <span
                      className={cn(
                        'font-mono text-sm truncate',
                        isHighlighted ? 'text-[var(--accent)]' : 'text-[var(--primary-text)]',
                      )}
                    >
                      {model.id}
                    </span>
                    {providerBadge()}
                    {isCurrent && (
                      <Check size={14} className="ml-auto shrink-0 text-[var(--accent)]" aria-hidden />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {footerModel && (
            <div className="border-t border-[var(--border)] px-3 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-[var(--tertiary-text)]">
                {t('settings.ai.model_name_label')}:
              </span>
              <span className="text-xs font-medium text-[var(--secondary-text)] truncate">
                {footerModel.name}
              </span>
              {showContextWindow && footerModel.contextWindow > 0 && (
                <span className="text-xs tabular-nums text-[var(--tertiary-text)]">
                  · {formatContextWindow(footerModel.contextWindow)} ctx
                </span>
              )}
              {renderBadges(footerModel)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
