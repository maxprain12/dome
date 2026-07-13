import { HugeiconsIcon } from '@hugeicons/react';
import {
  Film01Icon as Film,
  ChevronDownIcon as ChevronDown,
  Search01Icon as Search,
  CheckIcon as Check,
  GiftIcon as Gift,
  Shield01Icon as Shield,
  BrainIcon as Brain,
  Image01Icon as ImageIcon,
} from '@hugeicons/core-free-icons';
import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import type { ModelDefinition } from '@/lib/ai/models';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command } from '@/components/ui/command';
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

function formatContextWindow(ctx: number): string {
  if (ctx === 0) return '';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
  return String(ctx);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
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
  }, [isOpen, filteredModels, selectedModelId]);

  // Keep the highlight in range and scrolled into view.
  useEffect(() => {
    if (!isOpen) return;
    setHighlightedIndex((i) => Math.min(i, Math.max(0, filteredModels.length - 1)));
  }, [filteredModels.length, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    rowRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

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
      nodes.push(<Badge variant="secondary" className="max-w-full text-primary" key="rec"><span className="truncate">Recommended</span></Badge>);
    }
    if (isFreeProvider) {
      nodes.push(
        <span key="free" className="inline-flex items-center gap-0.5">
          <HugeiconsIcon icon={Gift} size={10} className="shrink-0 text-primary" aria-hidden />
          <Badge variant="secondary" className="max-w-full text-primary"><span className="truncate">Free</span></Badge>
        </span>,
      );
    }
    if (isPrivateProvider) {
      nodes.push(
        <span key="priv" className="inline-flex items-center gap-0.5">
          <HugeiconsIcon icon={Shield} size={10} className="shrink-0 text-muted-foreground" aria-hidden />
          <Badge variant="secondary" className="max-w-full text-muted-foreground"><span className="truncate">Private</span></Badge>
        </span>,
      );
    }
    if (model.reasoning) {
      nodes.push(
        <span key="reason" className="inline-flex items-center gap-0.5">
          <HugeiconsIcon icon={Brain} size={10} className="shrink-0 text-primary" aria-hidden />
          <Badge variant="secondary" className="max-w-full text-primary"><span className="truncate">Reasoning</span></Badge>
        </span>,
      );
    }
    if (model.input?.includes('image')) {
      nodes.push(
        <span key="vision" className="inline-flex items-center gap-0.5">
          <HugeiconsIcon icon={ImageIcon} size={10} className="shrink-0 text-primary" aria-hidden />
          <Badge variant="secondary" className="max-w-full text-primary"><span className="truncate">Vision</span></Badge>
        </span>,
      );
    }
    if (model.input?.includes('video')) {
      nodes.push(
        <span key="video" className="inline-flex items-center gap-0.5">
          <HugeiconsIcon icon={Film} size={10} className="shrink-0 text-primary" aria-hidden />
          <Badge variant="secondary" className="max-w-full text-primary"><span className="truncate">Video</span></Badge>
        </span>,
      );
    }
    return nodes.length ? <span className="flex flex-wrap items-center gap-1.5">{nodes}</span> : null;
  };

  /** `[provider]` badge on each model row. */
  const providerBadge = (extraClass = '') =>
    providerId ? (
      <span
        className={cn('font-mono text-[11px] shrink-0 text-muted-foreground', extraClass)}
      >
        [{providerId}]
      </span>
    ) : null;

  // Model whose details are shown in the footer (the keyboard-highlighted row).
  const footerModel = isOpen ? filteredModels[highlightedIndex] : undefined;

  return (
    <Popover open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setSearchQuery(''); }}>
      <PopoverTrigger render={<Button type="button"
  variant="outline"
  disabled={disabled}
  onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false);
        }}
  aria-haspopup="listbox"
  aria-expanded={isOpen}
  className={cn(
          'w-full justify-between gap-3 px-4 py-3 h-auto min-h-0 rounded-lg text-left font-normal',
          'bg-card',
          isOpen && 'ring-2 ring-primary border-primary',
        )} />}>
        <div className="flex-1 min-w-0 text-left">
          {selectedModel ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium truncate text-foreground">
                {selectedModel.id}
              </span>
              {providerBadge()}
              {renderBadges(selectedModel)}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          )}
        </div>
      {
          <HugeiconsIcon icon={ChevronDown}
            size={18}
            className={cn('shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
            aria-hidden
          />
        }
      </PopoverTrigger>

      {isOpen && (
        <PopoverContent align="start" className="w-[var(--anchor-width)] gap-0 overflow-hidden rounded-xl border border-border bg-background p-0 shadow-lg">
          <Command shouldFilter={false} className="rounded-none bg-background p-0">
          {configuredHint && (
            <div className="px-3 pt-2.5 pb-1.5 text-[11px] leading-snug text-muted-foreground">
              {t('settings.ai.models_configured_only')}
            </div>
          )}
          {searchable && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <HugeiconsIcon icon={Search}
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  ref={searchInputRef}
                  className="pl-9 font-mono"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleListKeyDown}
                  placeholder={t('settings.ai.search_models')}
                />
              </div>
            </div>
          )}
          <ul ref={listRef} role="listbox" tabIndex={-1} className="max-h-60 overflow-y-auto py-1 list-none m-0 p-0" onKeyDown={handleListKeyDown}>
            {filteredModels.length === 0 ? (
              <li className="list-none p-4 text-center text-sm text-muted-foreground">
                {searchQuery ? t('settings.ai.no_models_found', { query: searchQuery }) : emptyMessage}
              </li>
            ) : (
              filteredModels.map((model, idx) => {
                const isCurrent = model.id === selectedModelId;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <li key={model.id} className="list-none">
                  <Button variant="ghost"
                    ref={(el) => { rowRefs.current[idx] = el; }}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => commitSelection(model)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                      isHighlighted ? 'bg-muted' : 'bg-transparent',
                    )}
                  >
                    <span
                      className={cn(
                        'w-3 shrink-0 text-center',
                        isHighlighted ? 'text-primary' : 'text-transparent',
                      )}
                      aria-hidden
                    >
                      →
                    </span>
                    <span
                      className={cn(
                        'font-mono text-sm truncate',
                        isHighlighted ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {model.id}
                    </span>
                    {providerBadge()}
                    {isCurrent && (
                      <HugeiconsIcon icon={Check} size={14} className="ml-auto shrink-0 text-primary" aria-hidden />
                    )}
                  </Button>
                  </li>
                );
              })
            )}
          </ul>

          {footerModel && (
            <div className="border-t border-border px-3 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground">
                {t('settings.ai.model_name_label')}:
              </span>
              <span className="text-xs font-medium text-muted-foreground truncate">
                {footerModel.name}
              </span>
              {showContextWindow && footerModel.contextWindow > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  · {formatContextWindow(footerModel.contextWindow)} ctx
                </span>
              )}
              {renderBadges(footerModel)}
            </div>
          )}
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}
