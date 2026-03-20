
import { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useUserStore } from '@/lib/store/useUserStore';
import { validateEmail, validateName } from '@/lib/utils/validation';
import { getAnalyticsEnabled, setAnalyticsEnabled } from '@/lib/settings';
import { initPostHog, shutdownPostHog, isPostHogConfigured } from '@/lib/analytics/posthog';

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
      {children}
    </label>
  );
}

export default function GeneralSettings() {
  const { name, email, updateUserProfile, loadUserProfile } = useUserStore();
  const [localName, setLocalName] = useState(name);
  const [localEmail, setLocalEmail] = useState(email);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [isSaved, setIsSaved] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => { loadUserProfile(); }, [loadUserProfile]);
  useEffect(() => { setLocalName(name); setLocalEmail(email); }, [name, email]);
  useEffect(() => {
    getAnalyticsEnabled().then((enabled) => {
      setAnalyticsEnabledState(enabled);
      setAnalyticsLoading(false);
    });
  }, []);

  const handleSave = () => {
    const newErrors: { name?: string; email?: string } = {};
    if (!validateName(localName)) newErrors.name = 'Introduce un nombre válido (mínimo 2 caracteres)';
    if (!validateEmail(localEmail)) newErrors.email = 'Introduce una dirección de email válida';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    updateUserProfile({ name: localName.trim(), email: localEmail.trim() });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleAnalyticsToggle = async (enabled: boolean) => {
    setAnalyticsLoading(true);
    await setAnalyticsEnabled(enabled);
    setAnalyticsEnabledState(enabled);
    if (enabled && isPostHogConfigured()) await initPostHog(true);
    else if (!enabled) shutdownPostHog();
    setAnalyticsLoading(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>
          General
        </h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          Gestiona tu perfil y preferencias de la cuenta.
        </p>
      </div>

      {/* Profile */}
      <div>
        <SectionLabel>Perfil</SectionLabel>
        <SettingsCard>
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="user-name">Nombre completo</FieldLabel>
              <input
                id="user-name"
                type="text"
                value={localName}
                onChange={(e) => {
                  setLocalName(e.target.value);
                  if (errors.name && validateName(e.target.value)) setErrors(p => ({ ...p, name: undefined }));
                }}
                placeholder="Nombre Apellido"
                autoComplete="name"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--dome-bg-hover)',
                  color: 'var(--dome-text)',
                  border: `1px solid ${errors.name ? 'var(--dome-error, #ef4444)' : 'var(--dome-border)'}`,
                }}
                onFocus={(e) => { if (!errors.name) { e.target.style.borderColor = DOME_GREEN; e.target.style.boxShadow = `0 0 0 3px ${DOME_GREEN}15`; } }}
                onBlur={(e) => { if (!errors.name) { e.target.style.borderColor = 'var(--dome-border)'; e.target.style.boxShadow = 'none'; } }}
              />
              {errors.name && <p className="text-xs mt-1" style={{ color: 'var(--dome-error, #ef4444)' }}>{errors.name}</p>}
            </div>

            <div>
              <FieldLabel htmlFor="user-email">Email</FieldLabel>
              <input
                id="user-email"
                type="text"
                inputMode="email"
                value={localEmail}
                onChange={(e) => {
                  setLocalEmail(e.target.value);
                  if (errors.email && validateEmail(e.target.value)) setErrors(p => ({ ...p, email: undefined }));
                }}
                placeholder="nombre@ejemplo.com"
                autoComplete="email"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--dome-bg-hover)',
                  color: 'var(--dome-text)',
                  border: `1px solid ${errors.email ? 'var(--dome-error, #ef4444)' : 'var(--dome-border)'}`,
                }}
                onFocus={(e) => { if (!errors.email) { e.target.style.borderColor = DOME_GREEN; e.target.style.boxShadow = `0 0 0 3px ${DOME_GREEN}15`; } }}
                onBlur={(e) => { if (!errors.email) { e.target.style.borderColor = 'var(--dome-border)'; e.target.style.boxShadow = 'none'; } }}
              />
              {errors.email && <p className="text-xs mt-1" style={{ color: 'var(--dome-error, #ef4444)' }}>{errors.email}</p>}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                style={{ backgroundColor: DOME_GREEN }}
              >
                Guardar cambios
              </button>
              {isSaved && (
                <span className="flex items-center gap-1.5 text-xs animate-in fade-in" style={{ color: DOME_GREEN }}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Guardado
                </span>
              )}
            </div>
          </div>
        </SettingsCard>
      </div>

      {/* Privacy */}
      <div>
        <SectionLabel>Privacidad</SectionLabel>
        <SettingsCard>
          <label className="flex items-start gap-4 cursor-pointer">
            {/* Custom toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={analyticsEnabled}
              disabled={analyticsLoading || !isPostHogConfigured()}
              onClick={() => handleAnalyticsToggle(!analyticsEnabled)}
              className="relative shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors duration-200 disabled:opacity-50"
              style={{ backgroundColor: analyticsEnabled ? DOME_GREEN : 'var(--dome-border)' }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                style={{ transform: analyticsEnabled ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </button>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                Compartir datos de uso anónimos
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
                Ayuda a mejorar Dome entendiendo cómo se usa la app. Los datos son completamente anónimos.
              </p>
            </div>
          </label>
        </SettingsCard>
      </div>
    </div>
  );
}
