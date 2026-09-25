import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import type { AIProviderType } from '@/lib/ai/models';
import { DOME_PROVIDER_ENABLED, type ProviderOption } from '@/lib/ai/provider-options';
import { groupProviderOptions } from '@/lib/ai/provider-groups';
import { cn } from '@/lib/utils';
import ProviderBrandIcon from './ProviderBrandIcon';
import { providerStatusLabel } from './providerStatus';

export interface AIProviderListProps {
  /** Provider shown in the detail pane. */
  selected: AIProviderType;
  /** Provider Dome currently uses for chat (null while loading / in onboarding). */
  active: AIProviderType | null;
  configured: Record<string, boolean>;
  onSelect: (provider: AIProviderType) => void;
  hideDome?: boolean;
  className?: string;
}

/** Searchable, grouped provider list — the master column of Settings → AI → Chat. */
export default function AIProviderList({
  selected,
  active,
  configured,
  onSelect,
  hideDome = false,
  className,
}: AIProviderListProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const groups = useMemo(
    () => groupProviderOptions({ active, configured, query, hideDome: hideDome || !DOME_PROVIDER_ENABLED }),
    [active, configured, query, hideDome],
  );

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col gap-3', className)}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <HugeiconsIcon icon={Search01Icon} />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('settings.ai.provider_search')}
          aria-label={t('settings.ai.provider_search')}
        />
      </InputGroup>

      {groups.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>{t('settings.ai.provider_search_empty_title')}</EmptyTitle>
            <EmptyDescription>{t('settings.ai.provider_search_empty', { query: query.trim() })}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-1" aria-labelledby={`ai-provider-group-${group.key}`}>
              <h3
                id={`ai-provider-group-${group.key}`}
                className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {t(`settings.ai.provider_group.${group.key}`)}
              </h3>
              <div role="listbox" aria-labelledby={`ai-provider-group-${group.key}`} className="flex flex-col gap-0.5">
                {group.options.map((option) => (
                  <ProviderRow
                    key={option.value}
                    option={option}
                    selected={option.value === selected}
                    active={option.value === active}
                    configured={Boolean(configured[option.value])}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderRow({
  option,
  selected,
  active,
  configured,
  onSelect,
}: {
  option: ProviderOption;
  selected: boolean;
  active: boolean;
  configured: boolean;
  onSelect: (provider: AIProviderType) => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(option.value)}
      className={cn(
        'h-auto w-full min-w-0 justify-start gap-2.5 px-2 py-1.5 text-left font-normal',
        selectionSurfaceClass(selected),
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <ProviderBrandIcon provider={option.value} size={15} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{option.label}</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {providerStatusLabel(t, option.value, configured)}
        </span>
      </span>
      {option.badge ? (
        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
          {option.badge === 'EXPERIMENTAL' ? t('settings.ai.badge_experimental') : option.badge}
        </Badge>
      ) : null}
      {active ? (
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-4 shrink-0 text-primary"
          aria-label={t('settings.ai.active_provider')}
        />
      ) : null}
    </Button>
  );
}
