import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BrainIcon,
  ChevronDownIcon,
  Film01Icon,
  GiftIcon,
  Image01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ModelDefinition } from '@/lib/ai/models';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { cn } from '@/lib/utils';

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

/** Model picker: searchable command list with capability badges per model. */
export default function ModelSelector({
  models,
  selectedModelId,
  onChange,
  showBadges = true,
  showDescription = false,
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
  const [query, setQuery] = useState('');

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId],
  );

  const filteredModels = useMemo(() => {
    if (!query.trim()) return models;
    const q = query.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (providerId ?? '').toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q),
    );
  }, [models, query, providerId]);

  const renderBadges = (model: ModelDefinition): ReactNode => {
    if (!showBadges) return null;
    const nodes: ReactNode[] = [];
    if (model.recommended) {
      nodes.push(
        <Badge key="rec" variant="secondary" className="text-primary">
          Recommended
        </Badge>,
      );
    }
    if (isFreeProvider) {
      nodes.push(
        <Badge key="free" variant="secondary" className="text-primary">
          <HugeiconsIcon icon={GiftIcon} data-icon="inline-start" />
          Free
        </Badge>,
      );
    }
    if (isPrivateProvider) {
      nodes.push(
        <Badge key="priv" variant="secondary" className="text-muted-foreground">
          <HugeiconsIcon icon={Shield01Icon} data-icon="inline-start" />
          Private
        </Badge>,
      );
    }
    if (model.reasoning) {
      nodes.push(
        <Badge key="reason" variant="secondary" className="text-primary">
          <HugeiconsIcon icon={BrainIcon} data-icon="inline-start" />
          Reasoning
        </Badge>,
      );
    }
    if (model.input?.includes('image')) {
      nodes.push(
        <Badge key="vision" variant="secondary" className="text-primary">
          <HugeiconsIcon icon={Image01Icon} data-icon="inline-start" />
          Vision
        </Badge>,
      );
    }
    if (model.input?.includes('video')) {
      nodes.push(
        <Badge key="video" variant="secondary" className="text-primary">
          <HugeiconsIcon icon={Film01Icon} data-icon="inline-start" />
          Video
        </Badge>,
      );
    }
    return nodes.length ? (
      <span className="flex flex-wrap items-center gap-1.5">{nodes}</span>
    ) : null;
  };

  const providerBadge = providerId ? (
    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">[{providerId}]</span>
  ) : null;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setQuery('');
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            className={cn(
              'h-auto min-h-0 w-full justify-between gap-3 px-4 py-3 text-left font-normal',
              selectionSurfaceClass(Boolean(selectedModel), 'rounded-lg'),
            )}
          />
        }
      >
        <span className="min-w-0 flex-1 text-left">
          {selectedModel ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-mono text-sm font-medium text-foreground">
                {selectedModel.id}
              </span>
              {providerBadge}
              {renderBadges(selectedModel)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
            isOpen && 'rotate-180',
          )}
          aria-hidden
        />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        // Match trigger width (--anchor-width from Base UI Positioner). Override default w-72.
        className="w-(--anchor-width) min-w-(--anchor-width) max-w-(--available-width) gap-0 overflow-hidden rounded-xl p-0"
      >
        <Command shouldFilter={false} className="w-full min-w-0 bg-transparent">
          {configuredHint ? (
            <p className="px-3 pb-1.5 pt-2.5 text-[11px] leading-snug text-muted-foreground">
              {t('settings.ai.models_configured_only')}
            </p>
          ) : null}
          {searchable ? (
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t('settings.ai.search_models')}
              className="font-mono"
            />
          ) : null}
          <CommandList className="max-h-72 w-full min-w-0">
            <CommandEmpty>
              {query ? t('settings.ai.no_models_found', { query }) : emptyMessage}
            </CommandEmpty>
            <CommandGroup className="w-full min-w-0">
              {filteredModels.map((model) => {
                const isCurrent = model.id === selectedModelId;
                return (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    data-checked={isCurrent ? 'true' : undefined}
                    onSelect={() => {
                      onChange(model.id);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className={cn(
                      // flex-col + absolute check so the built-in Tick does not steal row width / truncate the id
                      'relative w-full min-w-0 flex-col items-start gap-1 border pr-8',
                      '[&>svg:last-of-type]:absolute [&>svg:last-of-type]:right-2.5 [&>svg:last-of-type]:top-2.5 [&>svg:last-of-type]:ml-0',
                      isCurrent
                        ? 'border-primary bg-brand-mint text-foreground data-selected:bg-brand-mint data-selected:text-foreground'
                        : 'border-transparent',
                    )}
                  >
                    <span className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          'min-w-0 flex-1 whitespace-normal break-all font-mono text-sm',
                          isCurrent && 'font-semibold text-primary',
                        )}
                      >
                        {model.id}
                      </span>
                      {providerBadge}
                      {showContextWindow && model.contextWindow > 0 ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatContextWindow(model.contextWindow)} ctx
                        </span>
                      ) : null}
                    </span>
                    {(showDescription && model.description) || showBadges ? (
                      <span className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
                        {renderBadges(model)}
                        {showDescription && model.description ? (
                          <span className="min-w-0 whitespace-normal text-xs text-muted-foreground">
                            {model.description}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
