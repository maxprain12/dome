'use client';

interface TabLayoutProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  loading?: boolean;
  skeleton?: React.ReactNode;
  actions?: React.ReactNode;
  /** Extra content between header and body (e.g. tabs, filters) */
  headerExtra?: React.ReactNode;
}

export default function TabLayout({
  icon,
  title,
  description,
  children,
  loading = false,
  skeleton,
  actions,
  headerExtra,
}: TabLayoutProps) {
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* Header */}
      <div
        className="shrink-0 px-6 py-5"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon ? (
              <div
                className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0"
                style={{ background: 'var(--dome-accent-bg)' }}
              >
                <span style={{ color: 'var(--dome-accent)' }}>{icon}</span>
              </div>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate" style={{ color: 'var(--dome-text)' }}>
                {title}
              </h1>
              <p className="text-xs truncate" style={{ color: 'var(--dome-text-muted)' }}>
                {description}
              </p>
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {headerExtra ? <div className="mt-4">{headerExtra}</div> : null}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && skeleton ? (
          <div className="p-6 animate-in fade-in duration-150 motion-reduce:animate-none">
            {skeleton}
          </div>
        ) : (
          <div className="p-6 animate-in fade-in duration-150 motion-reduce:animate-none">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
