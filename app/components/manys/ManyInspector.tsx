import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { ComputerIcon, RepeatIcon, Shield01Icon } from '@hugeicons/core-free-icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request, type ManyDetail } from '@/lib/manys/api';
import ManySettings from './ManySettings';
import ManyComputer from './ManyComputer';
import ManyRoutines from './ManyRoutines';

export type InspectorTab = 'computer' | 'context' | 'routines';

export const INSPECTOR_TABS: ReadonlyArray<{ id: InspectorTab; label: string; icon: IconSvgElement }> = [
  { id: 'computer', label: 'manys.computer', icon: ComputerIcon },
  { id: 'context', label: 'manys.context', icon: Shield01Icon },
  { id: 'routines', label: 'manys.recurrences', icon: RepeatIcon },
];

interface ManyInspectorProps {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  detail: ManyDetail;
  busy: boolean;
  /** The agent is working now, so the screen refreshes by itself. */
  live: boolean;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}

/** Right panel of Many's A: segmented tabs, then the selected tab's content. */
export default function ManyInspector({ tab, onTab, detail, busy, live, perform }: ManyInspectorProps) {
  const { t } = useTranslation();
  const manyId = detail.many.id;
  return (
    <aside className="flex max-h-[50vh] min-h-0 w-full shrink-0 flex-col border-t border-border lg:max-h-none lg:w-[380px] lg:border-t-0 lg:border-l">
      <div className="px-4 py-3">
        <Tabs value={tab} onValueChange={(value) => onTab(value as InspectorTab)}>
          <TabsList className="w-full">
            {INSPECTOR_TABS.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="flex-1 gap-1.5 text-xs">
                <HugeiconsIcon icon={item.icon} className="size-3.5" aria-hidden />
                {t(item.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-4">
        {tab === 'computer' && <ManyComputer key={manyId} manyId={manyId} control={detail.computer?.control ?? 'agent'} live={live} />}
        {tab === 'context' && (
          <ManySettings key={manyId} many={detail.many} onSave={(value) => perform(() => request(`/${manyId}`, 'PATCH', value))} />
        )}
        {tab === 'routines' && <ManyRoutines detail={detail} busy={busy} perform={perform} />}
      </div>
    </aside>
  );
}
