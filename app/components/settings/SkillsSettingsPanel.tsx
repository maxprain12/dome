import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, RefreshCw, Loader2, Zap } from 'lucide-react';
import { listSkills, openSkillsFolder, type SkillItem } from '@/lib/skills/client';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeListState from '@/components/ui/DomeListState';

export default function SkillsSettingsPanel() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSkills();
      if (res.success && Array.isArray(res.data)) {
        setSkills(res.data);
      } else {
        setSkills([]);
        setError(res.error ?? t('settings.skills.loadError', 'Error loading skills'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div style={{ padding: '0 24px 32px' }}>
      <DomeSubpageHeader
        title={t('settings.skills.title', 'Skills')}
        subtitle={t('settings.skills.subtitle_file', 'Skills live as SKILL.md files in ~/.dome/skills. Each skill is automatically available to every AI agent.')}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <DomeButton
          variant="secondary"
          size="sm"
          onClick={() => void openSkillsFolder()}
          leftIcon={<FolderOpen size={14} />}
        >
          {t('settings.skills.open_personal_dir', 'Open skills folder')}
        </DomeButton>
        <DomeButton
          variant="ghost"
          size="sm"
          onClick={() => void loadData()}
          leftIcon={loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          disabled={loading}
        >
          {t('common.refresh', 'Refresh')}
        </DomeButton>
      </div>

      {error && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      {/* Count label */}
      {!loading && skills.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--tertiary-text)' }}>
            {t('settings.skills.section_configured', 'Configured skills')}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
            backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary-text)',
          }}>
            {skills.length}
          </span>
        </div>
      )}

      {loading ? (
        <DomeListState variant="loading" />
      ) : skills.length === 0 ? (
        <DomeListState
          variant="empty"
          description={t('settings.skills.empty', 'No skills found. Add SKILL.md folders to the skills directory.')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillRow({ skill }: { skill: SkillItem }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '11px 14px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        transition: 'border-color 150ms ease',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-hover)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)')}
    >
      {/* Icon */}
      <div style={{
        width: 30, height: 30, borderRadius: 6, flexShrink: 0, marginTop: 1,
        backgroundColor: 'var(--accent-bg, var(--bg-tertiary))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Zap size={14} color="var(--accent)" strokeWidth={2.2} />
      </div>

      {/* Content */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: skill.description ? 3 : 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--primary-text)', lineHeight: 1.3 }}>
            {skill.name}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 500, padding: '1px 7px', borderRadius: 999,
            backgroundColor: 'var(--bg-tertiary)', color: 'var(--tertiary-text)',
            fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.01em',
          }}>
            {skill.slug}
          </span>
        </div>
        {skill.description && (
          <p style={{ fontSize: 12.5, color: 'var(--secondary-text)', lineHeight: 1.45, margin: 0 }}>
            {skill.description}
          </p>
        )}
      </div>
    </div>
  );
}
