import type { LucideIcon } from 'lucide-react';

export interface HubTitleBlockProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconAriaHidden?: boolean;
}

/** Leading title + subtitle + icon tile for hub toolbars */
export default function HubTitleBlock({ icon: Icon, title, subtitle, iconAriaHidden = true }: HubTitleBlockProps) {
  return (
    <>
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--dome-accent-bg)' }}
      >
        <Icon className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} strokeWidth={1.75} aria-hidden={iconAriaHidden} />
      </div>
      <div className="min-w-0">
        <h1 className="text-sm font-semibold truncate leading-tight" style={{ color: 'var(--dome-text)' }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--dome-text-muted)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </>
  );
}
