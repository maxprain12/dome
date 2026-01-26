'use client';

import { useAppStore } from '@/lib/store/useAppStore';
import { Sun, Moon, Monitor } from 'lucide-react';

type ThemeOption = 'light' | 'dark' | 'auto';

interface ThemeOptionItem {
  value: ThemeOption;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const themeOptions: ThemeOptionItem[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Always use light theme',
    icon: <Sun className="w-5 h-5" />,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use dark theme',
    icon: <Moon className="w-5 h-5" />,
  },
  {
    value: 'auto',
    label: 'Auto',
    description: 'Follow system preference',
    icon: <Monitor className="w-5 h-5" />,
  },
];

export default function AppearanceSettings() {
  const { theme, updateTheme } = useAppStore();

  const handleThemeChange = (newTheme: ThemeOption) => {
    updateTheme(newTheme);
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl font-medium mb-1" style={{ color: 'var(--primary)' }}>
          Appearance
        </h2>
        <p className="text-sm opacity-70" style={{ color: 'var(--secondary)' }}>
          Customize how Dome looks and feels
        </p>
      </div>

      {/* Theme Selection */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6 opacity-60" style={{ color: 'var(--secondary)' }}>
          Theme Mode
        </h3>

        <div className="grid grid-cols-3 gap-4">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleThemeChange(option.value)}
              className={`p-4 rounded-xl transition-all duration-200 border text-left group hover:scale-[1.02] active:scale-[0.98] ${theme === option.value ? 'ring-1 ring-blue-500/50 shadow-md' : 'hover:shadow-sm'
                }`}
              style={{
                backgroundColor: theme === option.value ? 'var(--bg-secondary)' : 'transparent',
                borderColor: theme === option.value ? 'var(--brand-primary)' : 'var(--border)',
              }}
            >
              <div className="flex flex-col items-center gap-4 py-2">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${theme === option.value ? 'shadow-inner' : ''
                    }`}
                  style={{
                    backgroundColor: theme === option.value ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                    color: theme === option.value ? 'white' : 'var(--secondary)',
                  }}
                >
                  {option.icon}
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--primary)' }}>
                    {option.label}
                  </div>
                  <div className="text-xs opacity-70" style={{ color: 'var(--secondary)' }}>
                    {option.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Additional Appearance Settings (Future) */}
      <section className="opacity-50 pointer-events-none grayscale">
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-4 opacity-60" style={{ color: 'var(--secondary)' }}>
          Advanced Customization
        </h3>
        <div className="p-4 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs text-center" style={{ color: 'var(--secondary)' }}>
            Additional appearance customization options coming soon
          </p>
        </div>
      </section>
    </div>
  );
}
