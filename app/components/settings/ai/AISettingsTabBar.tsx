import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  BrainIcon,
  Comment01Icon,
  Layers01Icon,
  Mic01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AISettingsTab } from './useAISectionController';

const TAB_DEFINITIONS: Array<{ value: AISettingsTab; labelKey: string; icon: IconSvgElement }> = [
  { value: 'chat', labelKey: 'settings.ai.tab_chat', icon: Comment01Icon },
  { value: 'embeddings', labelKey: 'settings.ai.tab_embeddings', icon: Layers01Icon },
  { value: 'transcription', labelKey: 'settings.ai.tab_transcription', icon: Mic01Icon },
  { value: 'tools', labelKey: 'settings.ai.tab_tools', icon: Search01Icon },
  { value: 'context', labelKey: 'settings.ai.tab_context', icon: BrainIcon },
];

export interface AISettingsTabBarProps {
  activeTab: AISettingsTab;
  onTabChange: (tab: AISettingsTab) => void;
}

export default function AISettingsTabBar({ activeTab, onTabChange }: AISettingsTabBarProps) {
  const { t } = useTranslation();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (value) onTabChange(value as AISettingsTab);
      }}
    >
      <TabsList className="w-full justify-start overflow-x-auto">
        {TAB_DEFINITIONS.map(({ value, labelKey, icon }) => (
          <TabsTrigger key={value} value={value} className="flex-none">
            <HugeiconsIcon icon={icon} data-icon="inline-start" />
            {t(labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
