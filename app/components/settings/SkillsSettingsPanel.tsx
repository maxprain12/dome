
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Save, FileJson, CheckCircle2, Loader2 } from 'lucide-react';
import { db } from '@/lib/db/client';
import { normalizeSkillImportArray } from '@/lib/skills/normalize-import';
import { generateId } from '@/lib/utils';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeToggle from '@/components/ui/DomeToggle';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeListState from '@/components/ui/DomeListState';
import DomeCard from '@/components/ui/DomeCard';
import DomeModal from '@/components/ui/DomeModal';

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
      const result = await db.getAISkills();
      if (!result.success || !Array.isArray(result.data)) {
        setSkills([]);
        return;
      }
      setSkills(
        result.data.map((s: SkillConfig) => ({
          id: s.id || generateId(),
          name: s.name || '',
          description: s.description || '',
          prompt: s.prompt || '',
          enabled: s.enabled !== false,
        }))
      );
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
      const result = await db.replaceAISkills(skills);
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
      const raw = normalizeSkillImportArray(parsed);
      const normalized: SkillConfig[] = raw.map((r) => ({
        id: r.id || generateId(),
        name: r.name,
        description: r.description,
        prompt: r.prompt,
        enabled: r.enabled,
      }));
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
    return <DomeListState variant="loading" loadingLabel="Cargando..." />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title="Skills"
        subtitle="Las skills son especializaciones prompt-driven que Many puede usar cuando sea relevante. Añade instrucciones para dominios concretos (SQL, revisión legal, formatos…)."
      />

      {error ? <DomeCallout tone="error">{error}</DomeCallout> : null}

      {/* Skills list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.skills.section_configured')}</DomeSectionLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              leftIcon={<FileJson className="w-3.5 h-3.5" aria-hidden />}
            >
              {t('settings.skills.export')}
            </DomeButton>
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowImport(true);
                setError(null);
                setImportJson('');
              }}
              leftIcon={<FileJson className="w-3.5 h-3.5" aria-hidden />}
            >
              {t('settings.skills.import')}
            </DomeButton>
            <DomeButton type="button" variant="primary" size="sm" onClick={addSkill} leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden />}>
              {t('settings.skills.add')}
            </DomeButton>
          </div>
        </div>

        {skills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--dome-border)]">
            <DomeListState variant="empty" title={t('settings.skills.empty')} compact />
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((skill, index) => (
              <DomeCard key={skill.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Row 1: toggle + name + slug */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <DomeToggle
                        checked={skill.enabled !== false}
                        onChange={(v) => updateSkill(index, { enabled: v })}
                        size="sm"
                      />
                      <DomeInput
                        type="text"
                        placeholder={t('settings.skills.name_placeholder')}
                        value={skill.name}
                        onChange={(e) => updateSkill(index, { name: e.target.value })}
                        className="w-48"
                        inputClassName="py-1.5 text-xs font-mono"
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
                      <DomeInput
                        type="text"
                        placeholder={t('settings.skills.description_placeholder')}
                        value={skill.description}
                        onChange={(e) => updateSkill(index, { description: e.target.value })}
                        className="w-full"
                        inputClassName="text-xs"
                      />
                    </div>

                    {/* Prompt */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                        {t('settings.skills.prompt_label')}
                      </label>
                      <DomeTextarea
                        placeholder={t('settings.skills.prompt_placeholder')}
                        value={skill.prompt}
                        onChange={(e) => updateSkill(index, { prompt: e.target.value })}
                        rows={4}
                        className="w-full"
                        textareaClassName="text-xs font-mono min-h-[100px]"
                      />
                    </div>
                  </div>

                  <DomeButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => removeSkill(index)}
                    className="shrink-0 text-[var(--dome-text-muted)]"
                    aria-label={t('settings.skills.delete_skill')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </DomeButton>
                </div>
              </DomeCard>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 flex-wrap">
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void saveSkills()}
          disabled={saving}
          leftIcon={
            saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Save className="w-3.5 h-3.5" aria-hidden />
          }
        >
          {saving ? t('settings.skills.saving') : t('settings.skills.save')}
        </DomeButton>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs animate-in fade-in" style={{ color: 'var(--dome-accent)' }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('settings.skills.saved')}
          </span>
        )}
      </div>

      <DomeModal
        open={showImport}
        size="lg"
        title={t('settings.skills.import_title')}
        onClose={() => {
          setShowImport(false);
          setImportJson('');
          setError(null);
        }}
        footer={
          <>
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowImport(false);
                setImportJson('');
                setError(null);
              }}
            >
              {t('common.cancel')}
            </DomeButton>
            <DomeButton type="button" variant="primary" size="sm" onClick={handleImport}>
              {t('settings.skills.import_btn')}
            </DomeButton>
          </>
        }
      >
        <p className="text-xs mb-3 text-[var(--dome-text-muted,var(--tertiary-text))]">
          {t('settings.skills.import_format', { format: FORMAT_EXAMPLE })}
        </p>
        {error ? (
          <p className="text-xs text-[var(--error)] mb-2" role="alert">
            {error}
          </p>
        ) : null}
        <DomeTextarea
          placeholder={t('settings.skills.import_placeholder')}
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          rows={12}
          className="flex-1 min-h-[200px]"
          textareaClassName="text-xs font-mono resize-none min-h-[200px]"
        />
      </DomeModal>
    </div>
  );
}
