
import { Sun, Moon, Monitor } from 'lucide-react';

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

const themes = [
  { value: 'light', label: 'Claro', icon: Sun, description: 'Blanco limpio con verdes académicos' },
  { value: 'system', label: 'Sistema', icon: Monitor, description: 'Sigue la preferencia del sistema operativo' },
  { value: 'dark', label: 'Oscuro', icon: Moon, description: 'Próximamente' },
];

export default function AppearanceSettings() {
  // Only light mode is supported currently
  const currentTheme = 'light';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>Apariencia</h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Personaliza cómo se ve Dome.</p>
      </div>

      {/* ── Theme ── */}
      <div>
        <SectionLabel>Tema</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {themes.map(({ value, label, icon: Icon, description }) => {
            const isActive = currentTheme === value;
            const isDisabled = value === 'dark' || value === 'system';
            return (
              <button
                key={value}
                disabled={isDisabled}
                className="p-4 rounded-xl text-left transition-all disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isActive ? `${DOME_GREEN}10` : 'var(--dome-surface)',
                  border: isActive ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                  opacity: isDisabled && !isActive ? 0.45 : 1,
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
                  style={{ backgroundColor: isActive ? DOME_GREEN_LIGHT : 'var(--dome-bg-hover)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: isActive ? DOME_GREEN : 'var(--dome-text-muted)' }} />
                </div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: isActive ? DOME_GREEN : 'var(--dome-text)' }}>
                  {label}
                </p>
                <p className="text-[10px] leading-tight" style={{ color: 'var(--dome-text-muted)' }}>
                  {description}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--dome-text-muted)', opacity: 0.7 }}>
          El tema oscuro y la sincronización con el sistema estarán disponibles próximamente.
        </p>
      </div>

      {/* ── Customization placeholder ── */}
      <div>
        <SectionLabel>Personalización</SectionLabel>
        <SettingsCard className="p-4">
          <div className="flex items-center gap-3 opacity-40">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: DOME_GREEN_LIGHT }} />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Opciones avanzadas de personalización</p>
              <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>Próximamente — fuentes, densidad, colores de acento</p>
            </div>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
