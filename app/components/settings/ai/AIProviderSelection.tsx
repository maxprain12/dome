import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  HardDriveIcon,
  Key01Icon,
  LockIcon,
  Settings01Icon,
  SparklesIcon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { isLocalChatProvider, PROVIDERS, type AIProviderType } from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS, DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { isVisibleModelsConfigurable } from '@/lib/ai/visible-models';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { cn } from '@/lib/utils';
import ProviderBrandIcon from './ProviderBrandIcon';

const EMPTY_CONFIGURED_PROVIDERS: Record<string, boolean> = {};

export interface AIProviderSelectionProps {
  provider: AIProviderType;
  onProviderChange: (provider: AIProviderType) => void;
  showSectionLabel?: boolean;
  highlightSelection?: boolean;
  configuredProviders?: Record<string, boolean>;
  onConfigureModels?: (provider: AIProviderType) => void;
  hideDomeProvider?: boolean;
}

const OAUTH_PROVIDERS = new Set<AIProviderType>([
  'dome',
  'copilot',
  'claude-oauth',
  'openai-codex',
]);

interface ProviderChoiceProps {
  value: AIProviderType;
  name: string;
  description: string;
  badge?: string;
  configured?: boolean;
  /** Explicit selected state (more reliable than Toggle data-state alone). */
  selected?: boolean;
  disabled?: boolean;
  local?: boolean;
  featured?: boolean;
  oauth?: boolean;
  onConfigure?: () => void;
  configureLabel?: string;
}

interface ProviderStatusBadgesProps {
  local?: boolean;
  configured?: boolean;
  featured?: boolean;
  oauth?: boolean;
}

/** Offline / connected / featured / needs-key badges — extracted for S3776. */
function ProviderStatusBadges({
  local,
  configured,
  featured,
  oauth = false,
}: ProviderStatusBadgesProps) {
  const { t } = useTranslation();

  if (local) {
    return (
      <Badge variant="outline">
        <HugeiconsIcon icon={HardDriveIcon} data-icon="inline-start" />
        {t('onboarding.offline')}
      </Badge>
    );
  }

  if (configured) {
    return (
      <Badge variant="secondary">
        <HugeiconsIcon icon={oauth ? LockIcon : Key01Icon} data-icon="inline-start" />
        {oauth ? t('settings.ai.status_connected') : t('settings.ai.key_saved')}
      </Badge>
    );
  }

  if (featured) {
    return (
      <>
        <Badge variant="outline">
          <HugeiconsIcon icon={LockIcon} data-icon="inline-start" />
          {t('settings.ai.private')}
        </Badge>
        <Badge variant="outline">
          <HugeiconsIcon icon={ZapIcon} data-icon="inline-start" />
          {t('settings.ai.fast')}
        </Badge>
      </>
    );
  }

  return (
    <Badge variant="outline">
      <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
      {oauth ? t('settings.ai.status_disconnected') : t('settings.ai.api_key_required')}
    </Badge>
  );
}

/** Gear button to open visible-models curation — extracted for S3776. */
function ProviderConfigureButton({
  onConfigure,
  configureLabel,
}: {
  onConfigure?: () => void;
  configureLabel?: string;
}) {
  if (!onConfigure) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="absolute right-2 top-2"
      aria-label={configureLabel}
      title={configureLabel}
      onClick={onConfigure}
    >
      <HugeiconsIcon icon={Settings01Icon} />
    </Button>
  );
}

const PROVIDER_ICON_SHELL =
  'flex size-8 shrink-0 items-center justify-center rounded-lg';

/** One selectable provider card: brand mark, name, status badges, gear to curate models. */
function ProviderChoice({
  value,
  name,
  description,
  badge,
  configured,
  selected = false,
  disabled,
  local,
  featured,
  oauth = false,
  onConfigure,
  configureLabel,
}: ProviderChoiceProps) {
  return (
    <div className="relative min-w-0">
      <ToggleGroupItem
        value={value}
        variant="outline"
        disabled={disabled}
        aria-label={name}
        aria-pressed={selected}
        data-selected={selected ? 'true' : undefined}
        className={cn(
          'h-auto min-h-28 w-full flex-col items-stretch justify-start gap-3 p-3 pr-11 text-left',
          selectionSurfaceClass(selected, selected ? 'shadow-sm' : 'bg-card'),
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              PROVIDER_ICON_SHELL,
              selected ? 'bg-brand-lime' : 'bg-muted',
            )}
          >
            <ProviderBrandIcon provider={value} size={17} />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
          {badge ? <Badge variant={featured ? 'default' : 'secondary'}>{badge}</Badge> : null}
        </span>
        <span className="whitespace-normal text-xs font-normal text-muted-foreground">
          {description}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <ProviderStatusBadges
            local={local}
            configured={configured}
            featured={featured}
            oauth={oauth}
          />
        </span>
      </ToggleGroupItem>
      <ProviderConfigureButton onConfigure={onConfigure} configureLabel={configureLabel} />
    </div>
  );
}

export default function AIProviderSelection({
  provider,
  onProviderChange,
  showSectionLabel = true,
  highlightSelection = true,
  configuredProviders = EMPTY_CONFIGURED_PROVIDERS,
  onConfigureModels,
  hideDomeProvider = false,
}: AIProviderSelectionProps) {
  const { t } = useTranslation();
  const cloudOptions = AI_PROVIDER_OPTIONS.filter(
    (option) => option.value !== 'dome' && !isLocalChatProvider(option.value),
  );
  const localOptions = AI_PROVIDER_OPTIONS.filter((option) => isLocalChatProvider(option.value));
  const configured = cloudOptions.filter((option) => configuredProviders[option.value]);
  const available = cloudOptions.filter((option) => !configuredProviders[option.value]);
  const groups =
    configured.length > 0 && available.length > 0
      ? [
          { key: 'configured', label: t('settings.ai.providers_configured'), options: configured },
          { key: 'available', label: t('settings.ai.providers_available'), options: available },
        ]
      : [{ key: 'all', label: null, options: cloudOptions }];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="ai-provider-title">
      {showSectionLabel ? (
        <h2
          id="ai-provider-title"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t('settings.ai.provider')}
        </h2>
      ) : null}
      <ToggleGroup
        value={highlightSelection ? [provider] : []}
        onValueChange={(values) => values[0] && onProviderChange(values[0] as AIProviderType)}
        className="flex w-full flex-col items-stretch gap-4"
      >
        {DOME_PROVIDER_ENABLED && !hideDomeProvider ? (
          <ProviderChoice
            value="dome"
            name={PROVIDERS.dome.name}
            description={`${PROVIDERS.dome.description}. ${t('settings.ai.no_own_key')}.`}
            badge={t('settings.ai.recommended')}
            featured
            oauth
            selected={provider === 'dome'}
            configured={Boolean(configuredProviders.dome)}
          />
        ) : null}

        {groups.map((group) =>
          group.options.length > 0 ? (
            <div key={group.key} className="flex flex-col gap-2">
              {group.label ? (
                <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
              ) : null}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.options.map((option) => {
                  const canConfigure =
                    isVisibleModelsConfigurable(option.value) && Boolean(onConfigureModels);
                  const isOauth = OAUTH_PROVIDERS.has(option.value);
                  const isConfigured = Boolean(configuredProviders[option.value]);
                  return (
                    <ProviderChoice
                      key={option.value}
                      value={option.value}
                      name={option.label}
                      description={
                        isConfigured
                          ? isOauth
                            ? t('settings.ai.status_connected')
                            : t('settings.ai.key_saved')
                          : isOauth
                            ? t('settings.ai.status_disconnected')
                            : t('settings.ai.api_key_required')
                      }
                      badge={option.badge}
                      configured={isConfigured}
                      selected={provider === option.value}
                      oauth={isOauth}
                      disabled={option.disabled}
                      onConfigure={
                        canConfigure ? () => onConfigureModels?.(option.value) : undefined
                      }
                      configureLabel={t('settings.ai.visible_models.gear_label', {
                        provider: option.label,
                      })}
                    />
                  );
                })}
              </div>
            </div>
          ) : null,
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">{t('settings.ai.providers_local')}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {localOptions.map((option) => (
              <ProviderChoice
                key={option.value}
                value={option.value}
                name={option.label}
                description={t('settings.ai.private_local')}
                badge={t('settings.ai.local_badge')}
                local
                selected={provider === option.value}
              />
            ))}
          </div>
        </div>
      </ToggleGroup>
    </section>
  );
}
