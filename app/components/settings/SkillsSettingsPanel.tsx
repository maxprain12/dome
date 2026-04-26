import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Save, FileJson, Loader2, FolderOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { normalizeSkillImportArray } from '@/lib/skills/normalize-import';
import {
  listSkills,
  saveSkillFile,
  createSkill,
  openSkillFolder,
  openPersonalSkillsRoot,
  getProjectSkillsRoot,
  setProjectSkillsRoot,
  getSkill,
  type SkillListItemWithBody,
} from '@/lib/skills/client';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeListState from '@/components/ui/DomeListState';
import DomeCard from '@/components/ui/DomeCard';
import DomeModal from '@/components/ui/DomeModal';

const FORMAT_EXAMPLE = '[ { "id", "name", "description", "prompt", "enabled" } ]';

export default function SkillsSettingsPanel() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillListItemWithBody[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editPath, setEditPath] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState('');
  const [projectRoot, setProjectRoot] = useState('');

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSkills({ includeBody: true });
      if (res.success && Array.isArray(res.data)) {
        setSkills(res.data);
      } else {
        setSkills([]);
      }
      const pr = await getProjectSkillsRoot();
      if (pr.success && pr.data?.projectRoot) {
        setProjectRoot(pr.data.projectRoot);
      } else {
        setProjectRoot('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar skills');
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    return window.electron.on('skills:updated', () => {
      void loadSkills();
    });
  }, [loadSkills]);

  const openEditor = async (id: string) => {
    const g = await getSkill(id);
    if (!g.success || !g.data?.filePath) {
      setError(t('settings.skills.error_load'));
      return;
    }
    setEditPath(g.data.filePath);
    setEditContent(g.data.raw ?? g.data.body ?? '');
    setEditingId(id);
  };

  const saveEditing = async () => {
    if (!editPath) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveSkillFile(editPath, editContent);
      if (res.success) {
        setEditingId(null);
        setEditPath(null);
        void loadSkills();
      } else {
        setError(res.error || t('settings.skills.error_save'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.skills.error_save'));
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(importJson);
      const raw = normalizeSkillImportArray(parsed);
      const list = raw.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        prompt: r.prompt,
        enabled: r.enabled,
      }));
      if (list.length === 0) {
        setError(t('settings.skills.error_no_skills'));
        return;
      }
      const result = (await window.electron.invoke('skills:importLegacy', list)) as { success: boolean; error?: string };
      if (result.success) {
        setShowImport(false);
        setImportJson('');
        setError(null);
        void loadSkills();
      } else {
        setError(result.error || t('settings.skills.error_invalid_json'));
      }
    } catch {
      setError(t('settings.skills.error_invalid_json'));
    }
  };

  const handleExport = () => {
    const legacy = skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      prompt: s.body || '',
      enabled: s.disable_model_invocation ? false : true,
    }));
    const blob = new Blob([JSON.stringify(legacy, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dome-skills.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleNewSkill = async () => {
    const res = await createSkill(newSlug || undefined);
    if (res.success) {
      setNewSlug('');
      setError(null);
      void loadSkills();
    } else {
      setError(res.error || t('settings.skills.create_failed'));
    }
  };

  const applyProjectRoot = async () => {
    const res = await setProjectSkillsRoot(projectRoot.trim() || null);
    if (res.success) {
      setError(null);
      void loadSkills();
    } else {
      setError(res.error || 'Invalid path');
    }
  };

  if (loading) {
    return <DomeListState variant="loading" loadingLabel="Cargando..." />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title="Skills"
        subtitle={t('settings.skills.subtitle_file')}
      />

      {error ? <DomeCallout tone="error">{error}</DomeCallout> : null}

      <DomeCard className="p-4">
        <DomeSectionLabel className="mb-2 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
          {t('settings.skills.project_root')}
        </DomeSectionLabel>
        <p className="text-xs text-[var(--dome-text-muted)] mb-2">{t('settings.skills.project_root_help')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <DomeInput
            value={projectRoot}
            onChange={(e) => setProjectRoot(e.target.value)}
            placeholder="/path/to/your/git/repo"
            className="flex-1 min-w-[200px]"
            inputClassName="text-xs"
          />
          <DomeButton type="button" size="sm" variant="primary" onClick={() => void applyProjectRoot()}>
            {t('settings.skills.save_project_root')}
          </DomeButton>
        </div>
      </DomeCard>

      <div>
        <div className="flex items-center justify-between mb-3">
          <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
            {t('settings.skills.section_configured')}
          </DomeSectionLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSkills()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden />}
            >
              {t('common.refresh')}
            </DomeButton>
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openPersonalSkillsRoot()}
              leftIcon={<FolderOpen className="w-3.5 h-3.5" aria-hidden />}
            >
              {t('settings.skills.open_personal_dir')}
            </DomeButton>
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
            <DomeInput
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder={t('settings.skills.new_slug_placeholder')}
              className="w-36"
              inputClassName="text-xs"
            />
            <DomeButton type="button" variant="primary" size="sm" onClick={() => void handleNewSkill()} leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden />}>
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
            {skills.map((skill) => (
              <DomeCard key={skill.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--primary-text)]">{skill.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--dome-border)] text-[var(--dome-text-muted)]">
                        {t(`settings.skills.scope.${skill.scope}`, { defaultValue: skill.scope })}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--dome-text-muted)] line-clamp-2">{skill.description}</p>
                    {skill.filePath ? (
                      <p className="text-[10px] font-mono text-[var(--dome-text-muted)] opacity-70 break-all">{skill.filePath}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <DomeButton type="button" variant="outline" size="sm" onClick={() => void openEditor(skill.id)}>
                        {t('settings.skills.edit')}
                      </DomeButton>
                      <DomeButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void openSkillFolder(skill.id)}
                        leftIcon={<ExternalLink className="w-3.5 h-3.5" aria-hidden />}
                      >
                        {t('settings.skills.open_folder')}
                      </DomeButton>
                    </div>
                  </div>
                </div>
              </DomeCard>
            ))}
          </div>
        )}
      </div>

      <DomeModal
        open={!!editingId}
        size="lg"
        title={t('settings.skills.edit_title')}
        onClose={() => {
          setEditingId(null);
          setEditPath(null);
        }}
        footer={
          <>
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingId(null);
                setEditPath(null);
              }}
            >
              {t('common.cancel')}
            </DomeButton>
            <DomeButton
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void saveEditing()}
              disabled={saving}
              leftIcon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            >
              {t('settings.skills.save')}
            </DomeButton>
          </>
        }
      >
        <p className="text-xs text-[var(--dome-text-muted)] mb-2">{t('settings.skills.edit_help')}</p>
        <DomeTextarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={22}
          className="w-full"
          textareaClassName="text-xs font-mono min-h-[400px]"
        />
      </DomeModal>

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
            <DomeButton type="button" variant="primary" size="sm" onClick={() => void handleImport()}>
              {t('settings.skills.import_btn')}
            </DomeButton>
          </>
        }
      >
        <p className="text-xs mb-3 text-[var(--dome-text-muted,var(--tertiary-text))]">
          {t('settings.skills.import_format', { format: FORMAT_EXAMPLE })}
        </p>
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
