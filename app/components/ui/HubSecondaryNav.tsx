import type { LucideIcon } from 'lucide-react';

export interface HubSecondaryNavTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

export interface HubSecondaryNavProps<T extends string> {
  tabs: readonly HubSecondaryNavTab<T>[];
  activeId: T;
  onChange: (id: T) => void;
}

/**
 * In-view hub section switcher (Agents / Workflows / Automations / Runs) when not using shell tabs.
 */
export default function HubSecondaryNav<T extends string>({ tabs, activeId, onChange }: HubSecondaryNavProps<T>) {
  return (
    <nav
      className="flex items-stretch gap-0 shrink-0 px-1"
      style={{ borderBottom: '1px solid var(--dome-border)', height: 40, background: 'var(--dome-bg)' }}
      aria-label="Hub"
    >
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex items-center gap-1.5 px-3 h-full text-[11px] font-medium transition-colors relative"
            style={{
              color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              background: 'transparent',
              borderBottom: isActive ? '2px solid var(--dome-accent)' : '2px solid transparent',
            }}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
