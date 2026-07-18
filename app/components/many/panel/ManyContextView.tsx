import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { BookOpen01Icon, BrainIcon, Cancel01Icon, GlobeIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import ResourceIcon from '@/components/shared/ResourceIcon';
import { useManyStore } from '@/lib/store/useManyStore';
import type { ManyConversationSettings } from '@/lib/many/useManyConversationSettings';
import { cn } from '@/lib/utils';

interface ManyContextViewProps {
  contextDescription: string;
  settings: ManyConversationSettings;
  /** Inline budget breakdown (gauge + popover) when a budget is known. */
  contextUsage?: ReactNode;
  className?: string;
}

function CapabilityRow({
  id,
  icon,
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  icon: typeof GlobeIcon;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <HugeiconsIcon icon={icon} className="shrink-0 text-muted-foreground" />
      <Label htmlFor={id} className="min-w-0 flex-1 truncate font-normal">
        {label}
      </Label>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * What Many can see right now: the active tab/resource, pinned resources,
 * capability toggles, the token budget and the active model. Always shows
 * real state — even with zero pins this is a control panel, not a placeholder.
 */
export default function ManyContextView({
  contextDescription,
  settings,
  contextUsage,
  className,
}: ManyContextViewProps) {
  const { t } = useTranslation();
  const pinnedResources = useManyStore((s) => s.pinnedResources);
  const removePinnedResource = useManyStore((s) => s.removePinnedResource);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3', className)}>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t('many.context_title')}</CardTitle>
          <CardDescription>
            {contextDescription || t('many.context_empty')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {contextDescription ? (
            <Badge variant="outline" className="max-w-full">
              <span className="truncate">{contextDescription}</span>
            </Badge>
          ) : null}
          {pinnedResources.length > 0 ? (
            <div className="flex flex-col gap-1">
              {pinnedResources.map((resource) => (
                <Item key={resource.id} size="sm" variant="muted" className="rounded-lg">
                  <ItemMedia>
                    <ResourceIcon type={resource.type} name={resource.title} size={14} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="truncate">{resource.title}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removePinnedResource(resource.id)}
                      aria-label={t('chat.remove_from_context')}
                      title={t('chat.remove_from_context')}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} />
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('many.context_pin_hint')}</p>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t('chat.capabilities_base')}</CardTitle>
          {!settings.supportsTools ? (
            <CardDescription>{t('chat.not_configured')}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CapabilityRow
            id="many-context-cap-web"
            icon={GlobeIcon}
            label={t('chat.capability_web')}
            checked={settings.toolsEnabled}
            onCheckedChange={settings.setToolsEnabled}
            disabled={!settings.supportsTools}
          />
          <CapabilityRow
            id="many-context-cap-resources"
            icon={BookOpen01Icon}
            label={t('chat.capability_resources')}
            checked={settings.resourceToolsEnabled}
            onCheckedChange={settings.setResourceToolsEnabled}
            disabled={!settings.supportsTools}
          />
          <CapabilityRow
            id="many-context-cap-memory"
            icon={BrainIcon}
            label={t('many.capability_memory')}
            checked={settings.memoryEnabled}
            onCheckedChange={settings.setMemoryEnabled}
            disabled={!settings.supportsTools}
          />
        </CardContent>
      </Card>

      {contextUsage || settings.providerInfo ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t('many.context_usage_title')}</CardTitle>
            {settings.providerInfo ? (
              <CardDescription className="truncate">{settings.providerInfo}</CardDescription>
            ) : null}
          </CardHeader>
          {contextUsage ? (
            <CardContent className="flex items-center justify-between gap-2">
              {contextUsage}
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
