'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db/client';
import type { SkillConfig } from '@/components/settings/SkillsSettingsPanel';

interface AgentSkillsStepProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function AgentSkillsStep({ selectedIds, onChange }: AgentSkillsStepProps) {
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSkills = useCallback(async () => {
    if (!db.isAvailable()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await db.getSetting('ai_skills');
      if (result.success && result.data) {
        try {
          const parsed = JSON.parse(result.data) as unknown;
          const list = Array.isArray(parsed) ? parsed : [];
          setSkills(
            list.map((s: SkillConfig) => ({
              id: s.id || '',
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
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const selectedSet = new Set(selectedIds);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return (
      <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
        Cargando skills...
      </p>
    );
  }

  if (skills.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
        No hay skills configurados. Crea skills en Ajustes → Skills para ampliar el conocimiento del agente.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
        Los skills añaden conocimiento especializado al agente. Elige los que quieras incluir.
      </p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {skills.map((s) => (
          <label
            key={s.id}
            className="flex items-start gap-2 cursor-pointer py-2 px-2 rounded-lg hover:bg-[var(--bg-hover)]"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(s.id)}
              onChange={() => toggle(s.id)}
              className="mt-1 rounded"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium block" style={{ color: 'var(--primary-text)' }}>
                {s.name}
              </span>
              {s.description && (
                <span className="text-xs block truncate" style={{ color: 'var(--secondary-text)' }}>
                  {s.description}
                </span>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
