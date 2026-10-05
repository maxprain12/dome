import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { ArrowLeft01Icon, ComputerIcon, FileSearchIcon, Key01Icon, RepeatIcon, Shield01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request, type ManyDetail } from '@/lib/manys/api';
import ManySettings from './ManySettings';
import ManyComputer from './ManyComputer';
import ManyRoutines from './ManyRoutines';
import ManyGovernance from './ManyGovernance';
import ManyAccess from './ManyAccess';

export type InspectorTab = 'computer' | 'context' | 'routines' | 'access' | 'governance';

export const INSPECTOR_TABS: ReadonlyArray<{ id: InspectorTab; label: string; icon: IconSvgElement }> = [
  { id: 'computer', label: 'manys.computer.title', icon: ComputerIcon },
  { id: 'context', label: 'manys.context', icon: Shield01Icon },
  { id: 'routines', label: 'manys.recurrences', icon: RepeatIcon },
  { id: 'access', label: 'manys.access.tab', icon: Key01Icon },
  { id: 'governance', label: 'manys.governance.tab', icon: FileSearchIcon },
];

/** The three tabs of the design. Access and Governance are advanced views reached from Context. */
const PRIMARY_TABS = INSPECTOR_TABS.slice(0, 3);

interface ManyInspectorProps {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  detail: ManyDetail;
  busy: boolean;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}

/** Right panel of Many's A: Computer, Context and Routines; advanced views open from Context. */
export default function ManyInspector({ tab, onTab, detail, busy, perform }: ManyInspectorProps) {
  const { t } = useTranslation();
  const manyId = detail.many.id;
  const advanced = tab === 'access' || tab === 'governance';
  return (
    <aside className="flex max-h-[50vh] min-h-0 w-full shrink-0 flex-col border-t border-border lg:max-h-none lg:w-[380px] lg:border-t-0 lg:border-l">
      <div className="px-4 py-3">
        {advanced ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onTab('context')}>
              <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden />
              {t('manys.inspector.back')}
            </Button>
            <h2 className="min-w-0 grow truncate text-sm font-semibold">{t(tab === 'access' ? 'manys.access.tab' : 'manys.governance.tab')}</h2>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(value) => onTab(value as InspectorTab)}>
            <TabsList className="h-auto w-full justify-start group-data-horizontal/tabs:h-auto">
              {PRIMARY_TABS.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="h-7 flex-1 gap-1.5 text-xs">
                  <HugeiconsIcon icon={item.icon} className="size-3.5" aria-hidden />
                  {t(item.label)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-4">
        {tab === 'computer' && <ManyComputer key={manyId} manyId={manyId} many={detail.many} control={detail.computer?.control ?? 'agent'} perform={perform} />}
        {tab === 'context' && (
          <ManySettings
            key={manyId}
            many={detail.many}
            busy={busy}
            onSave={(value) => perform(() => request(`/${manyId}`, 'PATCH', value))}
            onAdvanced={onTab}
            onGrants={(grants) => { void perform(() => request(`/${manyId}`, 'PATCH', { name: detail.many.name, instructions: detail.many.instructions, grants })); }}
          />
        )}
        {tab === 'routines' && <ManyRoutines detail={detail} busy={busy} perform={perform} />}
        {tab === 'access' && <ManyAccess key={manyId} manyId={manyId} />}
        {tab === 'governance' && <ManyGovernance key={manyId} manyId={manyId} />}
      </div>
    </aside>
  );
}
