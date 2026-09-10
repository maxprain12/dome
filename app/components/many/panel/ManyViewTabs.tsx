import { HugeiconsIcon } from '@hugeicons/react';
import {
  BubbleChatIcon,
  HistoryIcon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type ManyPanelViewId = 'chat' | 'history' | 'context';

export interface ManyViewLabels {
  chat: string;
  history: string;
  context: string;
}

interface ManyViewTabsProps {
  value: ManyPanelViewId;
  onValueChange: (value: ManyPanelViewId) => void;
  labels: ManyViewLabels;
  presentation?: 'icons' | 'labels';
  className?: string;
}

const VIEWS = [
  { id: 'chat', icon: BubbleChatIcon },
  { id: 'history', icon: HistoryIcon },
  { id: 'context', icon: InformationCircleIcon },
] as const;

/**
 * Browser-safe primary navigation shared by the Desktop and extension
 * adapters. The labels variant keeps all three destinations explicit on
 * narrow linked surfaces; Desktop can retain its compact icon treatment.
 */
export default function ManyViewTabs({
  value,
  onValueChange,
  labels,
  presentation = 'icons',
  className,
}: ManyViewTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as ManyPanelViewId)}
      className={className}
    >
      <TabsList className={cn(presentation === 'labels' && 'grid w-full grid-cols-3')}>
        {VIEWS.map(({ id, icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            title={labels[id]}
            aria-label={labels[id]}
            className={cn(presentation === 'labels' && 'gap-1 px-2')}
          >
            <HugeiconsIcon icon={icon} />
            {presentation === 'labels' ? <span>{labels[id]}</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
