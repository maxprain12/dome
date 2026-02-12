
import { useState, useRef, useEffect, useMemo } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ChevronDown, Search, CheckCircle2, Gift, Shield, Brain, ImageIcon } from 'lucide-react';
import type { ModelDefinition } from '@/lib/ai/models';

interface ModelSelectorProps {
  // Data
  models: ModelDefinition[];
  selectedModelId: string;
  onChange: (modelId: string) => void;

  // Display
  showBadges?: boolean;
  showDescription?: boolean;
  showContextWindow?: boolean;

  // Provider-specific badges
  isFreeProvider?: boolean;
  isPrivateProvider?: boolean;

  // Behavior
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
  providerType = 'cloud',
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Get selected model details
  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId]
  );

  // Filtered models based on search
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;

    const query = searchQuery.toLowerCase();
    return models.filter(
      (model) =>
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        model.description?.toLowerCase().includes(query)
    );
  }, [models, searchQuery]);

  // Calculate dropdown position (fixed positioning)
  const calculatePosition = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownWidth = 480;
    const dropdownMaxHeight = Math.min(400, window.innerHeight * 0.6);

    let top = rect.bottom + 8;
    let left = rect.left;

    // Adjust if overflows right edge
    if (left + dropdownWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - dropdownWidth - 16);
    }

    // Adjust if overflows bottom edge
    if (top + dropdownMaxHeight > window.innerHeight - 16) {
      top = rect.top - dropdownMaxHeight - 8;
    }

    setDropdownPosition({ top, left });
  };

  // Click-outside detection
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(0);
      }
    };

    const handleScroll = () => {
      calculatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true, passive: true });
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0) {
      const itemElement = document.getElementById(`model-item-${highlightedIndex}`);
      itemElement?.scrollIntoView({
        block: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [highlightedIndex, isOpen, prefersReducedMotion]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        calculatePosition();
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(0);
        triggerRef.current?.focus();
        break;

      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, filteredModels.length - 1));
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (filteredModels[highlightedIndex]) {
          handleSelect(filteredModels[highlightedIndex].id);
        }
        break;

      case 'Tab':
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(0);
        break;
    }
  };

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(0);
  };

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    calculatePosition();
    setTimeout(() => {
      if (searchable) {
        searchInputRef.current?.focus();
      }
    }, 50);
  };

  // Format context window
  const formatContextWindow = (contextWindow: number): string => {
    if (contextWindow === 0) return '';
    if (contextWindow >= 1000000) {
      return `${(contextWindow / 1000000).toFixed(contextWindow % 1000000 === 0 ? 0 : 1)}M`;
    }
    if (contextWindow >= 1000) {
      return `${(contextWindow / 1000).toFixed(contextWindow % 1000 === 0 ? 0 : 0)}K`;
    }
    return contextWindow.toString();
  };

  // Render badges
  const renderBadges = (model: ModelDefinition) => {
    if (!showBadges) return null;

    const badges = [];

    if (model.recommended) {
      badges.push(
        <span key="recommended" className="model-badge recommended">
          Recommended
        </span>
      );
    }

    if (isFreeProvider) {
      badges.push(
        <span key="free" className="model-badge free inline-flex items-center gap-1">
          <Gift size={10} />
          Free
        </span>
      );
    }

    if (isPrivateProvider) {
      badges.push(
        <span key="private" className="model-badge private inline-flex items-center gap-1">
          <Shield size={10} />
          Private
        </span>
      );
    }

    if (model.reasoning) {
      badges.push(
        <span key="reasoning" className="model-badge reasoning inline-flex items-center gap-1">
          <Brain size={10} />
          Reasoning
        </span>
      );
    }

    if (model.input?.includes('image')) {
      badges.push(
        <span key="vision" className="model-badge vision inline-flex items-center gap-1">
          <ImageIcon size={10} />
          Vision
        </span>
      );
    }

    return badges.length > 0 ? <>{badges}</> : null;
  };

  return (
    <div className="relative w-full">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="model-dropdown-list"
        aria-label={`Select model. Currently selected: ${selectedModel?.name || 'None'}`}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg transition-all"
        style={{
          backgroundColor: disabled ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
          border: `1.5px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <div className="flex-1 min-w-0 text-left">
          {selectedModel ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                  {selectedModel.name}
                </span>
                {showBadges && renderBadges(selectedModel)}
              </div>
              {showDescription && selectedModel.description && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs truncate" style={{ color: 'var(--secondary-text)' }}>
                    {selectedModel.description}
                  </span>
                  {showContextWindow && selectedModel.contextWindow > 0 && (
                    <>
                      <span style={{ color: 'var(--tertiary-text)' }}>•</span>
                      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--secondary-text)' }}>
                        {formatContextWindow(selectedModel.contextWindow)} ctx
                      </span>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <span className="text-sm" style={{ color: 'var(--tertiary-text)' }}>
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDown
          size={18}
          style={{
            color: 'var(--secondary-text)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          role="listbox"
          id="model-dropdown-list"
          aria-activedescendant={`model-item-${highlightedIndex}`}
          className="dropdown-menu"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: 480,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          {/* Search Input */}
          {searchable && (
            <div className="px-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="relative">
                <label htmlFor="model-selector-search" className="sr-only">Search models</label>
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--tertiary-text)' }}
                />
                <input
                  id="model-selector-search"
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder="Buscar modelos..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  style={{
                    color: 'var(--primary-text)',
                    border: '1px solid var(--border)',
                  }}
                  onKeyDown={handleKeyDown}
                />
              </div>
              {/* Results count */}
              <div className="sr-only" aria-live="polite" aria-atomic="true">
                {filteredModels.length} {filteredModels.length === 1 ? 'modelo' : 'modelos'} encontrado
                {filteredModels.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* Model List */}
          <div
            className="max-h-[min(400px,60vh)] overflow-y-auto custom-scrollbar"
            style={{ scrollbarGutter: 'stable' }}
          >
            {filteredModels.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                  {searchQuery ? (
                    <>
                      No se encontraron modelos con &ldquo;
                      {searchQuery}
                      &rdquo;
                    </>
                  ) : (
                    <>{emptyMessage}</>
                  )}
                </p>
              </div>
            ) : (
              filteredModels.map((model, index) => {
                const isSelected = model.id === selectedModelId;
                const isHighlighted = index === highlightedIndex;

                return (
                  <button
                    key={model.id}
                    id={`model-item-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(model.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-all rounded-md"
                    style={{
                      backgroundColor: isHighlighted
                        ? 'var(--bg-secondary)'
                        : isSelected
                          ? 'var(--bg-tertiary)'
                          : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <div className="flex items-center min-w-0 flex-1 gap-2">
                      {isSelected && (
                        <CheckCircle2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                            {model.name}
                          </span>
                          {renderBadges(model)}
                        </div>
                        {showDescription && model.description && (
                          <span className="text-xs block truncate mt-0.5" style={{ color: 'var(--secondary-text)' }}>
                            {model.description}
                          </span>
                        )}
                      </div>
                    </div>
                    {showContextWindow && model.contextWindow > 0 && (
                      <span
                        className="text-xs tabular-nums shrink-0"
                        style={{ color: 'var(--secondary-text)', opacity: 0.7 }}
                      >
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
