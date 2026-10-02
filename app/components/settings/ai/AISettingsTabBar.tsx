import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  BrainIcon,
  Comment01Icon,
} from '@hugeicons/core-free-icons';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { AISettingsTab } from './useAISectionController';

const TAB_DEFINITIONS: Array<{ value: AISettingsTab; labelKey: string; icon: IconSvgElement }> = [
  { value: 'chat', labelKey: 'settings.ai.tab_chat', icon: Comment01Icon },
  { value: 'capabilities', labelKey: 'ai_capabilities.title', icon: BrainIcon },
  { value: 'context', labelKey: 'settings.ai.tab_context', icon: BrainIcon },
];

export interface AISettingsTabBarProps {
  activeTab: AISettingsTab;
  children: ReactNode;
  disabled?: boolean;
  onTabChange: (tab: AISettingsTab) => void;
}

export default function AISettingsTabBar({ activeTab, onTabChange, children, disabled }: AISettingsTabBarProps) {
  const { t } = useTranslation();

  return (
    <Tabs
      className="min-w-0 gap-6"
      value={activeTab}
      onValueChange={(value) => {
        if (value) onTabChange(value as AISettingsTab);
      }}
    >
      <TabsList className="h-auto! w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
        {TAB_DEFINITIONS.map(({ value, labelKey, icon }) => (
          <TabsTrigger disabled={disabled} key={value} value={value} className="h-9 flex-none px-3 text-sm">
            <HugeiconsIcon icon={icon} data-icon="inline-start" />
            {t(labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={activeTab} className="flex min-w-0 flex-col gap-6">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{activeTab === 'capabilities' ? t('ai_capabilities.description') : t(`settingsGuide.ai.${activeTab}`)}</p>
        {children}
      </TabsContent>
    </Tabs>
  );
}
