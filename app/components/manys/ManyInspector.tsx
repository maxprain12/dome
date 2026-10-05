import { useTranslation } from 'react-i18next';
import ManyAvatar from '@/components/many/ManyAvatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type ManyDetail } from '@/lib/manys/api';
import { cn } from '@/lib/utils';
import ManyComputer from './ManyComputer';
import ManyDetails from './ManyDetails';
import { STATUS_DOT, statusLabelKey, type ManyStatus } from './manyStatus';

export type InspectorTab = 'details' | 'computer';
const TABS: readonly InspectorTab[] = ['details', 'computer'];

interface ManyInspectorProps {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  detail: ManyDetail;
  status: ManyStatus;
  busy: boolean;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}

/** The side of a Many: who it is, then two tabs, what it keeps and its computer. */
export default function ManyInspector({ tab, onTab, detail, status, busy, perform }: ManyInspectorProps) {
  const { t } = useTranslation();
  const manyId = detail.many.id;
  return (
    <aside className="flex max-h-[50vh] min-h-0 w-full shrink-0 flex-col border-t border-border lg:max-h-none lg:w-[380px] lg:border-t-0 lg:border-l">
      <div className="flex flex-col items-center gap-1 px-4 pt-5">
        <ManyAvatar size="lg" state="idle" />
        <h2 className="max-w-full truncate text-base font-semibold tracking-tight">{detail.many.name}</h2>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', STATUS_DOT[status])} />
          {t(statusLabelKey(status))}
        </p>
      </div>
      <div className="flex justify-center px-4 py-3">
        <Tabs value={tab} onValueChange={(value) => onTab(value as InspectorTab)}>
          <TabsList>
            {TABS.map((id) => <TabsTrigger key={id} value={id} className="text-xs">{t(`manys.tabs.${id}`)}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-4">
        {tab === 'details' && <ManyDetails detail={detail} busy={busy} perform={perform} />}
        {tab === 'computer' && <ManyComputer key={manyId} manyId={manyId} many={detail.many} control={detail.computer?.control ?? 'agent'} perform={perform} />}
      </div>
    </aside>
  );
}
