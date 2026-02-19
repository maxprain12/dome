'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, FileJson } from 'lucide-react';
import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled?: boolean;
}

const FORMAT_EXAMPLE = '[ { "id", "name", "description", "prompt", "enabled" } ]';

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export default function SkillsSettingsPanel() {
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

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

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
    setSkills((prev) => [
      ...prev,
      { id: generateId(), name: '', description: '', prompt: '', enabled: true },
    ]);
  };

  const removeSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSkill = (index: number, updates: Partial<SkillConfig>) => {
    setSkills((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
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
        setError('No se encontraron skills válidos en el JSON');
      }
    } catch (e) {
      setError('JSON inválido. Usa un array de objetos con id, name, description, prompt.');
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(skills, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dome-skills.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2" style={{ color: 'var(--secondary-text)' }}>
        <span className="animate-pulse">Cargando...</span>
      </div>
    );
  }

  const inputStyle = {
    borderColor: 'var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          Skills
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--secondary-text)' }}>
          Las skills son especializaciones prompt-driven que Many puede usar cuando sea relevante. Añade instrucciones y contexto para dominios concretos (ej. SQL, revisión legal, formatos).
        </p>
      </div>

      {error ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)' }}
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--secondary-text)' }}>
            Skills configuradas
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
            >
              <FileJson className="w-4 h-4" />
              Exportar JSON
            </button>
            <button
              type="button"
              onClick={() => {
                setShowImport(true);
                setError(null);
                setImportJson('');
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
            >
              <FileJson className="w-4 h-4" />
              Importar JSON
            </button>
            <button
              type="button"
              onClick={addSkill}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--primary-subtle)', color: 'var(--accent)' }}
            >
              <Plus className="w-4 h-4" />
              Añadir
            </button>
          </div>
        </div>

        {skills.length === 0 ? (
          <div
            className="rounded-lg border border-dashed px-6 py-8 text-center text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
          >
            No hay skills. Añade una o importa desde JSON.
          </div>
        ) : (
          <div className="space-y-4">
            {skills.map((skill, index) => (
              <div
                key={skill.id}
                className="rounded-lg border p-4"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={skill.enabled !== false}
                        onClick={() => updateSkill(index, { enabled: skill.enabled === false })}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${skill.enabled !== false ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
                        title={skill.enabled !== false ? 'Activo' : 'Inactivo'}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-200 ease-out ${skill.enabled !== false ? 'left-[calc(100%-1.25rem)]' : 'left-0.5'}`}
                        />
                      </button>
                      <input
                        type="text"
                        placeholder="Nombre (slug: write_sql, review_legal_doc)"
                        value={skill.name}
                        onChange={(e) => updateSkill(index, { name: e.target.value })}
                        className="rounded-md border px-3 py-2 text-sm w-56 font-mono"
                        style={inputStyle}
                      />
                      {skill.name ? (
                        <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                          slug: {slugify(skill.name) || '(vacío)'}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-xs mt-1 mb-1" style={{ color: 'var(--secondary-text)' }}>
                        Descripción (cuándo usarla)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Experto en SQL. Usa cuando el usuario necesite consultas o análisis de datos."
                        value={skill.description}
                        onChange={(e) => updateSkill(index, { description: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mt-1 mb-1" style={{ color: 'var(--secondary-text)' }}>
                        Contenido del prompt
                      </label>
                      <textarea
                        placeholder="Instrucciones especializadas, ejemplos, reglas..."
                        value={skill.prompt}
                        onChange={(e) => updateSkill(index, { prompt: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm font-mono min-h-[120px] resize-y"
                        style={inputStyle}
                        rows={5}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSkill(index)}
                    className="rounded p-2"
                    style={{ color: 'var(--secondary-text)' }}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showImport ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowImport(false)}
        >
          <div
            className="rounded-lg border p-6 max-w-2xl w-full max-h-[80vh] flex flex-col"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              Importar JSON
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--secondary-text)' }}>
              Formato: {FORMAT_EXAMPLE}
            </p>
            <textarea
              placeholder="Pega tu JSON aquí"
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="flex-1 min-h-[200px] rounded-md border px-3 py-2 text-sm font-mono resize-none"
              style={inputStyle}
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleImport}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Importar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImport(false);
                  setImportJson('');
                  setError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button
          type="button"
          onClick={saveSkills}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
