import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { LeftToRightListBulletIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PROVIDERS, type AIProviderType } from '@/lib/ai/models';
import { providerKind } from '@/lib/ai/provider-groups';
import { isVisibleModelsConfigurable } from '@/lib/ai/visible-models';
import ProviderBrandIcon from './ProviderBrandIcon';
import { providerKindLabel, providerStatusLabel } from './providerStatus';

export interface AIProviderDetailProps {
  provider: AIProviderType;
  active: AIProviderType | null;
  configured: boolean;
  /** Opens the visible-models curator; omitted where curation is not offered (onboarding). */
  onConfigureModels?: (provider: AIProviderType) => void;
  /** Credentials / model panel for the provider. */
  children: ReactNode;
  footer?: ReactNode;
}

/** Detail pane: who the provider is, whether Dome uses it, its credentials and selector models. */
export default function AIProviderDetail({
  provider,
  active,
  configured,
  onConfigureModels,
  children,
  footer,
}: AIProviderDetailProps) {
  const { t } = useTranslation();
  const name = PROVIDERS[provider]?.name ?? provider;
  const isActive = provider === active;
  const canCurate = Boolean(onConfigureModels) && isVisibleModelsConfigurable(provider);

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-2xl border bg-card p-5" aria-labelledby="ai-provider-detail-title">
      <header className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <ProviderBrandIcon provider={provider} size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id="ai-provider-detail-title" className="truncate text-base font-semibold">{name}</h3>
          <p className="text-xs text-muted-foreground">
            {providerKindLabel(t, providerKind(provider))} · {providerStatusLabel(t, provider, configured)}
          </p>
        </div>
        {active ? (
          <Badge variant={isActive ? 'default' : 'outline'} className="shrink-0">
            {isActive ? t('settings.ai.in_use') : t('settings.ai.not_in_use')}
          </Badge>
        ) : null}
      </header>

      <div className="flex min-w-0 flex-col gap-4">{children}</div>

      {canCurate ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">{t('settings.ai.visible_models.row_title')}</span>
            <span className="text-xs text-muted-foreground">{t('settings.ai.visible_models.row_desc')}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onConfigureModels?.(provider)}>
            <HugeiconsIcon icon={LeftToRightListBulletIcon} data-icon="inline-start" />
            {t('settings.ai.visible_models.row_action')}
          </Button>
        </div>
      ) : null}

      {footer}
    </section>
  );
}
