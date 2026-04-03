export function DashboardSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[11px] font-semibold uppercase tracking-widest mb-3"
      style={{ color: 'var(--dome-text-secondary, #4a4766)' }}
    >
      {children}
    </h2>
  );
}
