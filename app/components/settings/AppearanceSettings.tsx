export default function AppearanceSettings() {
  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl font-display font-semibold mb-1" style={{ color: 'var(--primary-text)' }}>
          Appearance
        </h2>
        <p className="text-sm opacity-70" style={{ color: 'var(--secondary-text)' }}>
          Customize how Dome looks and feels
        </p>
      </div>

      {/* Theme selector hidden - only light mode is supported */}

      {/* Additional Appearance Settings (Future) */}
      <section className="opacity-50 pointer-events-none grayscale">
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-4 opacity-60" style={{ color: 'var(--secondary-text)' }}>
          Advanced Customization
        </h3>
        <div className="p-4 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs text-center" style={{ color: 'var(--secondary-text)' }}>
            Additional appearance customization options coming soon
          </p>
        </div>
      </section>
    </div>
  );
}
