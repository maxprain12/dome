'use client';

import { useAppStore } from '@/lib/store/useAppStore';
import type { CitationStyle } from '@/types';

const citationStyles: { value: CitationStyle; label: string; description: string }[] = [
  { value: 'apa', label: 'APA', description: 'American Psychological Association' },
  { value: 'mla', label: 'MLA', description: 'Modern Language Association' },
  { value: 'chicago', label: 'Chicago', description: 'Chicago Manual of Style' },
  { value: 'harvard', label: 'Harvard', description: 'Harvard Referencing' },
  { value: 'vancouver', label: 'Vancouver', description: 'Vancouver System' },
  { value: 'ieee', label: 'IEEE', description: 'Institute of Electrical and Electronics Engineers' },
];

export default function AdvancedSettings() {
  const { citationStyle, autoSave, autoBackup, updateCitationStyle, updatePreferences } = useAppStore();

  const handleToggleAutoSave = () => {
    updatePreferences({ autoSave: !autoSave });
  };

  const handleToggleAutoBackup = () => {
    updatePreferences({ autoBackup: !autoBackup });
  };

  const handleCitationStyleChange = (style: CitationStyle) => {
    updateCitationStyle(style);
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl font-display font-semibold mb-1" style={{ color: 'var(--primary-text)' }}>
          Advanced
        </h2>
        <p className="text-sm opacity-80" style={{ color: 'var(--secondary-text)' }}>
          Configure advanced settings and preferences
        </p>
      </div>

      {/* System Preferences */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          System Preferences
        </h3>

        <div className="space-y-4">
          {/* Auto-Save */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1 pr-8">
              <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--primary-text)' }}>
                Auto-Save
              </h3>
              <p className="text-xs opacity-80" style={{ color: 'var(--secondary-text)' }}>
                Automatically save your work as you type
              </p>
            </div>
            <button
              onClick={handleToggleAutoSave}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSave ? '' : ''}`}
              style={{
                backgroundColor: autoSave ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSave ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Auto-Backup */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1 pr-8">
              <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--primary-text)' }}>
                Auto-Backup
              </h3>
              <p className="text-xs opacity-80" style={{ color: 'var(--secondary-text)' }}>
                Automatically create backups of your data
              </p>
            </div>
            <button
              onClick={handleToggleAutoBackup}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoBackup ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              style={{
                backgroundColor: autoBackup ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoBackup ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Citation Style */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Citation Style
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {citationStyles.map((style) => (
            <button
              key={style.value}
              onClick={() => handleCitationStyleChange(style.value)}
              className={`p-4 rounded-lg text-left transition-all border ${citationStyle === style.value ? 'bg-blue-50/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              style={{
                backgroundColor: citationStyle === style.value ? 'var(--bg-secondary)' : 'transparent',
                borderColor: citationStyle === style.value ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div className="font-medium text-sm mb-1" style={{ color: 'var(--primary-text)' }}>
                {style.label}
              </div>
              <div className="text-xs opacity-70" style={{ color: 'var(--secondary-text)' }}>
                {style.description}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
