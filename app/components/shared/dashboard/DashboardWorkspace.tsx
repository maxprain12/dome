import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon, Settings02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Field, FieldLabel } from '@/components/ui/field';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { normalizeDashboardPanels, useDashboardPanels, type DashboardScope } from '@/lib/store/useDashboardPanels';

export type DashboardPanel = { id: string; label: string; wide?: boolean; content: ReactNode };

export function DashboardWorkspace({ scope, title, description, eyebrow, panels, actions }: {
  scope: DashboardScope;
  title: string;
  description: string;
  eyebrow: string;
  panels: DashboardPanel[];
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const uid = useId();
  const saved = useDashboardPanels((state) => state.layouts[scope]);
  const setLayout = useDashboardPanels((state) => state.setLayout);
  const defaults = panels.map((panel) => ({ id: panel.id, visible: true, wide: panel.wide ?? false }));
  const layout = normalizeDashboardPanels(saved, defaults);
  const byId = new Map(panels.map((panel) => [panel.id, panel]));
  const move = (index: number, direction: number) => {
    const next = [...layout];
    const destination = index + direction;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    setLayout(scope, next);
  };
  return (
    <div className="dashboard-workspace mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-5 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="sm" />}>
              <HugeiconsIcon icon={Settings02Icon} data-icon="inline-start" />{t('dashboardPanels.customize')}
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t('dashboardPanels.customize')}</SheetTitle>
                <SheetDescription>{t('dashboardPanels.customize_hint')}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-5 px-6 pb-6">
                {layout.map((item, index) => (
                  <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor={`${uid}-${item.id}`}>{byId.get(item.id)?.label}</FieldLabel>
                      <Switch id={`${uid}-${item.id}`} checked={item.visible} onCheckedChange={(visible) => setLayout(scope, layout.map((entry) => entry.id === item.id ? { ...entry, visible } : entry))} />
                    </Field>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ToggleGroup size="sm" variant="outline" value={[item.wide ? 'wide' : 'half']} aria-label={t('dashboardPanels.width')} onValueChange={(values) => {
                        if (!values.length) return;
                        setLayout(scope, layout.map((entry) => entry.id === item.id ? { ...entry, wide: values[0] === 'wide' } : entry));
                      }}>
                        <ToggleGroupItem value="half">{t('dashboardPanels.half')}</ToggleGroupItem>
                        <ToggleGroupItem value="wide">{t('dashboardPanels.wide')}</ToggleGroupItem>
                      </ToggleGroup>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" disabled={index === 0} aria-label={t('dashboardPanels.move_up', { name: byId.get(item.id)?.label })} onClick={() => move(index, -1)}><HugeiconsIcon icon={ArrowUp01Icon} /></Button>
                        <Button variant="ghost" size="icon-sm" disabled={index === layout.length - 1} aria-label={t('dashboardPanels.move_down', { name: byId.get(item.id)?.label })} onClick={() => move(index, 1)}><HugeiconsIcon icon={ArrowDown01Icon} /></Button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" onClick={() => setLayout(scope, defaults)}>{t('dashboardPanels.reset')}</Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <div className="grid grid-cols-1 items-stretch gap-5 @min-[760px]/dashboard:grid-cols-2">
        {layout.filter((item) => item.visible).map((item) => (
          <section key={item.id} aria-label={byId.get(item.id)?.label} className={cn('min-w-0 [&>div[data-slot=card]]:h-full', item.wide && '@min-[760px]/dashboard:col-span-2')}>
            {byId.get(item.id)?.content}
          </section>
        ))}
      </div>
      {!layout.some((item) => item.visible) && <Empty><EmptyHeader><EmptyTitle>{t('dashboardPanels.hidden')}</EmptyTitle><EmptyDescription>{t('dashboardPanels.hidden_hint')}</EmptyDescription></EmptyHeader></Empty>}
    </div>
  );
}
