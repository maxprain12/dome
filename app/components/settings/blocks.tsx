import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import type { HubSurfaceProps, HubGroupProps, HubRowProps } from '@/components/hub/HubBlocks';
import { cn } from '@/lib/utils';
import type { SettingsSection } from './registry';

export function SettingsSurface({ section, title, description, icon, actions, children, className }: HubSurfaceProps & { section?: SettingsSection }) {
  const { t } = useTranslation();
  return <section className={cn('flex min-w-0 flex-col gap-6', className)}>
    <header className="flex flex-wrap items-start gap-4 border-b border-border/60 pb-5">
      {icon && <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground"><HugeiconsIcon icon={icon} className="size-5" aria-hidden /></span>}
      <div className="min-w-0 flex-1">
        <h1 tabIndex={-1} className="text-balance text-2xl font-semibold tracking-tight outline-none">{section ? t(`settings.tabs.${section}`) : title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{section ? t(`settingsGuide.sections.${section}.description`) : description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {section && section !== 'ai' && <p className="w-full text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{t('settingsGuide.start')} </span>{t(`settingsGuide.sections.${section}.start`)}</p>}
    </header>
    {children}
  </section>;
}

export function SettingsGroup({ title, description, actions, children, bare = false, className }: HubGroupProps) {
  return <section className={cn('flex min-w-0 flex-col gap-3', className)}>
    {(title || description || actions) && <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">{title && <h2 className="text-sm font-semibold">{title}</h2>}{description && <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>}
    {bare ? children : <div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">{children}</div>}
  </section>;
}

export function SettingsRow({ title, description, htmlFor, control, children, className }: HubRowProps) {
  const Title = htmlFor ? 'label' : 'p';
  return <div className={cn('@container/setting flex min-w-0 flex-col gap-3 p-5', className)}>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1 basis-48"><Title htmlFor={htmlFor} className="block text-sm font-medium">{title}</Title>{description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>
      {control && <div className="flex max-w-full flex-wrap items-center gap-2">{control}</div>}
    </div>
    {children}
  </div>;
}
