import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BookOpen01Icon,
  BrainIcon,
  GlobeIcon,
  HashIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '../../../../../app/components/ui/button';
import { Input } from '../../../../../app/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../../../app/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../../app/components/ui/select';
import { Switch } from '../../../../../app/components/ui/switch';
import type {
  ModelCatalogItem,
  ThinkingLevel,
} from '../../lib/client';
import ManyCatalogPicker from './ManyCatalogPicker';
import { readableLabel } from './manyAssistantUtils';

interface CatalogItem {
  id: string;
  label: string;
  description?: string;
}

interface ManyAssistantControlsProps {
  skills: CatalogItem[];
  mcpServers: CatalogItem[];
  resources: CatalogItem[];
  selectedMcpIds: string[];
  resourceQuery: string;
  toolsEnabled: boolean;
  resourceToolsEnabled: boolean;
  memoryEnabled: boolean;
  interactionLocked: boolean;
  models: ModelCatalogItem[];
  selectedModelId: string;
  selectedModelLabel: string;
  providerLabel: string;
  thinkingLevel: ThinkingLevel;
  thinkingLevels: ThinkingLevel[];
  onInsertSkill: (label: string) => void;
  onToggleMcp: (item: CatalogItem) => void;
  onResourceQueryChange: (query: string) => void;
  onPinResource: (item: CatalogItem) => void;
  onToolsEnabledChange: (enabled: boolean) => void;
  onResourceToolsEnabledChange: (enabled: boolean) => void;
  onMemoryEnabledChange: (enabled: boolean) => void;
  onModelChange: (modelId: string | null) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
}

export default function ManyAssistantControls({
  skills,
  mcpServers,
  resources,
  selectedMcpIds,
  resourceQuery,
  toolsEnabled,
  resourceToolsEnabled,
  memoryEnabled,
  interactionLocked,
  models,
  selectedModelId,
  selectedModelLabel,
  providerLabel,
  thinkingLevel,
  thinkingLevels,
  onInsertSkill,
  onToggleMcp,
  onResourceQueryChange,
  onPinResource,
  onToolsEnabledChange,
  onResourceToolsEnabledChange,
  onMemoryEnabledChange,
  onModelChange,
  onThinkingLevelChange,
}: ManyAssistantControlsProps) {
  const { t } = useTranslation();
  return (
    <>
      <ManyCatalogPicker
        label={t('skills')}
        items={skills}
        trigger={
          <Button type="button" variant="ghost" size="icon-sm" title={t('skills')} disabled={interactionLocked}>
            /
          </Button>
        }
        onSelect={(item) => onInsertSkill(item.label)}
      />
      <ManyCatalogPicker
        label={t('mcpServers')}
        items={mcpServers}
        selectedIds={selectedMcpIds}
        trigger={
          <Button type="button" variant="ghost" size="icon-sm" title={t('mcpServers')} disabled={interactionLocked || !toolsEnabled}>
            <HugeiconsIcon icon={HashIcon} />
          </Button>
        }
        onSelect={onToggleMcp}
      />
      <Popover>
        <PopoverTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" title={t('resources')} disabled={interactionLocked} />}
        >
          @
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-72 gap-2">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Search01Icon} />
            <Input
              value={resourceQuery}
              onChange={(event) => onResourceQueryChange(event.target.value)}
              placeholder={t('searchResources')}
              className="flex-1"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {resources.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={interactionLocked}
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => onPinResource(item)}
              >
                <span className="truncate text-xs font-medium">{item.label}</span>
                {item.description ? (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" title={t('capabilities')} disabled={interactionLocked} />}
        >
          <HugeiconsIcon icon={GlobeIcon} />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-64 gap-3">
          {[
            { id: 'composer-web', label: t('webTools'), checked: toolsEnabled, set: onToolsEnabledChange, icon: GlobeIcon },
            { id: 'composer-resources', label: t('resourceTools'), checked: resourceToolsEnabled, set: onResourceToolsEnabledChange, icon: BookOpen01Icon },
            { id: 'composer-memory', label: t('memory'), checked: memoryEnabled, set: onMemoryEnabledChange, icon: BrainIcon },
          ].map((capability) => (
            <label key={capability.id} className="flex items-center gap-2 text-xs">
              <HugeiconsIcon icon={capability.icon} />
              <span className="min-w-0 flex-1">{capability.label}</span>
              <Switch size="sm" checked={capability.checked} onCheckedChange={capability.set} disabled={interactionLocked} />
            </label>
          ))}
        </PopoverContent>
      </Popover>
      <Select value={selectedModelId} onValueChange={onModelChange} disabled={interactionLocked || models.length === 0}>
        <SelectTrigger
          size="sm"
          className="max-w-32"
          aria-label={t('model')}
          title={`${providerLabel} · ${selectedModelLabel}`}
        >
          <SelectValue>{selectedModelLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent side="top" align="end">
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {readableLabel(model.name, t('modelUnavailable'))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={thinkingLevel} onValueChange={(value) => onThinkingLevelChange(value as ThinkingLevel)} disabled={interactionLocked}>
        <SelectTrigger size="sm" aria-label={t('thinkingLevel')}>
          <SelectValue>{t(`thinking_${thinkingLevel}`)}</SelectValue>
        </SelectTrigger>
        <SelectContent side="top">
          {thinkingLevels.map((level) => (
            <SelectItem key={level} value={level}>
              {t(`thinking_${level}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
