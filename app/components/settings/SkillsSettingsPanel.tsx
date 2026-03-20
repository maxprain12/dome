
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Save, FileJson, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled?: boolean;
}

const FORMAT_EXAMPLE = '[ { "id", "name", "description", "prompt", "enabled" } ]';

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200"
      style={{ backgroundColor: checked ? DOME_GREEN : 'var(--dome-border)' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--dome-bg-hover)',
  border: '1px solid var(--dome-border)',
  color: 'var(--dome-text)',
  outline: 'none',
};

export default function SkillsSettingsPanel() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');

  const loadSkills = useCallback(async () => {
    if (!db.isAvailable()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await db.getSetting('ai_skills');
      if (result.success && result.data) {
        try {
          const parsed = JSON.parse(result.data);
          const list = Array.isArray(parsed) ? parsed : [];
          setSkills(
            list.map((s: SkillConfig) => ({
              id: s.id || generateId(),
              name: s.name || '',
              description: s.description || '',
              prompt: s.prompt || '',
              enabled: s.enabled !== false,
            }))
          );
        } catch {
          setSkills([]);
        }
      } else {
        setSkills([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar skills');
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  const saveSkills = async () => {
    if (!db.isAvailable()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await db.setSetting('ai_skills', JSON.stringify(skills));
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error || 'Error al guardar');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const addSkill = () => {
    setSkills((prev) => [...prev, { id: generateId(), name: '', description: '', prompt: '', enabled: true }]);
  };

  const removeSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSkill = (index: number, updates: Partial<SkillConfig>) => {
    setSkills((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson);
      const list = Array.isArray(parsed) ? parsed : [];
      const normalized = list
        .map((s: unknown) => {
          if (!s || typeof s !== 'object') return null;
          const t = s as Record<string, unknown>;
          return {
            id: (typeof t.id === 'string' ? t.id : generateId()) as string,
            name: (typeof t.name === 'string' ? t.name : '') as string,
            description: (typeof t.description === 'string' ? t.description : '') as string,
            prompt: (typeof t.prompt === 'string' ? t.prompt : '') as string,
            enabled: (t.enabled as boolean) !== false,
          };
        })
        .filter((s): s is SkillConfig => s !== null);
      if (normalized.length > 0) {
        setSkills(normalized);
        setShowImport(false);
        setImportJson('');
        setError(null);
      } else {
        setError(t('settings.skills.error_no_skills'));
      }
    } catch {
      setError(t('settings.skills.error_invalid_json'));
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(skills, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dome-skills.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs animate-pulse" style={{ color: 'var(--dome-text-muted)' }}>
        Cargando...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>Skills</h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          Las skills son especializaciones prompt-driven que Many puede usar cuando sea relevante. Añade instrucciones para dominios concretos (SQL, revisión legal, formatos…).
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--dome-error, #ef4444)' }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Skills list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>{t('settings.skills.section_configured')}</SectionLabel>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
            >
              <FileJson className="w-3.5 h-3.5" />
              {t('settings.skills.export')}
            </button>
            <button
              type="button"
              onClick={() => { setShowImport(true); setError(null); setImportJson(''); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
            >
              <FileJson className="w-3.5 h-3.5" />
              {t('settings.skills.import')}
            </button>
            <button
              type="button"
              onClick={addSkill}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white transition-all"
              style={{ backgroundColor: DOME_GREEN }}
            >
              <Plus className="w-3.5 h-3.5" />
              {t('settings.skills.add')}
            </button>
          </div>
        </div>

        {skills.length === 0 ? (
          <div
            className="py-10 rounded-xl border-dashed text-center"
            style={{ border: '1.5px dashed var(--dome-border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.skills.empty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((skill, index) => (
              <div
                key={skill.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Row 1: toggle + name + slug */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Toggle
                        checked={skill.enabled !== false}
                        onChange={() => updateSkill(index, { enabled: skill.enabled === false })}
                      />
                      <input
                        type="text"
                        placeholder={t('settings.skills.name_placeholder')}
                        value={skill.name}
                        onChange={(e) => updateSkill(index, { name: e.target.value })}
                        className="rounded-lg px-3 py-1.5 text-xs font-mono w-48"
                        style={inputStyle}
                      />
                      {skill.name && (
                        <span className="text-[10px]" style={{ color: 'var(--dome-text-muted)', opacity: 0.7 }}>
                          slug: {slugify(skill.name) || t('settings.skills.slug_empty')}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                        {t('settings.skills.description_label')}
                      </label>
                      <input
                        type="text"
                        placeholder={t('settings.skills.description_placeholder')}
                        value={skill.description}
                        onChange={(e) => updateSkill(index, { description: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs"
                        style={inputStyle}
                      />
                    </div>

                    {/* Prompt */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                        {t('settings.skills.prompt_label')}
                      </label>
                      <textarea
                        placeholder={t('settings.skills.prompt_placeholder')}
                        value={skill.prompt}
                        onChange={(e) => updateSkill(index, { prompt: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs font-mono min-h-[100px] resize-y"
                        style={inputStyle}
                        rows={4}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSkill(index)}
                    className="p-1.5 rounded-lg shrink-0 transition-colors"
                    style={{ color: 'var(--dome-text-muted)' }}
                    aria-label={t('settings.skills.delete_skill')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={saveSkills}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: DOME_GREEN }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? t('settings.skills.saving') : t('settings.skills.save')}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs animate-in fade-in" style={{ color: DOME_GREEN }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('settings.skills.saved')}
          </span>
        )}
      </div>

      {/* Import modal */}
      {showImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowImport(false)}
        >
          <div
            className="rounded-xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col"
            style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--dome-text)' }}>{t('settings.skills.import_title')}</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.skills.import_format', { format: FORMAT_EXAMPLE })}</p>
            <textarea
              placeholder={t('settings.skills.import_placeholder')}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="flex-1 min-h-[200px] rounded-lg px-3 py-2 text-xs font-mono resize-none"
              style={inputStyle}
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleImport}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: DOME_GREEN }}
              >
                {t('settings.skills.import_btn')}
              </button>
              <button
                type="button"
                onClick={() => { setShowImport(false); setImportJson(''); setError(null); }}
                className="px-4 py-2 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
