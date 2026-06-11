import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, RefreshCw, Loader2, Zap, Github, Search, Download, ChevronDown, ChevronUp } from 'lucide-react';
import {
  listSkills,
  openSkillsFolder,
  addSkillsFromRepo,
  browseSkillsRepo,
  type SkillItem,
  type SkillRepoEntry,
} from '@/lib/skills/client';
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

      <InstallFromGitHub onInstalled={() => void loadData()} />

      {error && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      {!loading && skills.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 20 }}>
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
          description={t('settings.skills.empty', 'No skills installed. Add SKILL.md files to the skills folder or install from a GitHub repository.')}
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

function InstallFromGitHub({ onInstalled }: { onInstalled: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState('');
  const [skillName, setSkillName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [repoSkills, setRepoSkills] = useState<SkillRepoEntry[]>([]);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());

  async function handleInstall() {
    if (!url.trim()) return;
    setInstalling(true);
    setMessage(null);
    setRepoSkills([]);
    try {
      const names = skillName.trim() ? [skillName.trim()] : undefined;
      const res = await addSkillsFromRepo(url.trim(), names);
      if (res.success && res.data) {
        const installed = Array.isArray(res.data) ? res.data : [res.data];
        const label = installed.map((s) => s.name).join(', ');
        setMessage({
          type: 'success',
          text: t('settings.skills.install_success', { defaultValue: '✓ "{{name}}" installed successfully.', name: label }),
        });
        setUrl('');
        setSkillName('');
        onInstalled();
      } else {
        setMessage({ type: 'error', text: res.error ?? t('settings.skills.install_failed', 'Installation failed.') });
      }
    } finally {
      setInstalling(false);
    }
  }

  async function handleBrowse() {
    if (!url.trim()) return;
    setBrowsing(true);
    setMessage(null);
    setRepoSkills([]);
    try {
      const res = await browseSkillsRepo(url.trim());
      if (res.success && res.data) {
        if (res.data.length === 0) {
          setMessage({ type: 'error', text: t('settings.skills.no_skills_found', 'No skills found in that repository.') });
        } else {
          setRepoSkills(res.data);
        }
      } else {
        setMessage({ type: 'error', text: res.error ?? t('settings.skills.browse_failed', 'Could not browse that repository.') });
      }
    } finally {
      setBrowsing(false);
    }
  }

  async function handleInstallRepoSkill(entry: SkillRepoEntry) {
    if (!url.trim()) return;
    setInstallingIds((prev) => new Set(prev).add(entry.id));
    try {
      const res = await addSkillsFromRepo(url.trim(), [entry.id]);
      if (res.success) {
        setMessage({
          type: 'success',
          text: t('settings.skills.install_success', { defaultValue: '✓ "{{name}}" installed successfully.', name: entry.name }),
        });
        onInstalled();
      } else {
        setMessage({ type: 'error', text: res.error ?? t('settings.skills.install_failed', 'Installation failed.') });
      }
    } finally {
      setInstallingIds((prev) => {
        const s = new Set(prev);
        s.delete(entry.id);
        return s;
      });
    }
  }

  return (
    <div style={{
      marginBottom: 20,
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: 'var(--bg-secondary)',
    }}>
      <button
        onClick={() => { setExpanded((e) => !e); setMessage(null); setRepoSkills([]); }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--primary-text)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Github size={15} color="var(--secondary-text)" />
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>
            {t('settings.skills.install_from_github', 'Install from GitHub')}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} color="var(--tertiary-text)" /> : <ChevronDown size={14} color="var(--tertiary-text)" />}
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--secondary-text)', marginBottom: 10, lineHeight: 1.5 }}>
            {t('settings.skills.github_hint', 'Enter a GitHub repo URL and optional skill name (e.g. pptx). Equivalent to: npx skills add <repo> --skill <name>')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleInstall(); }}
              placeholder={t('settings.skills.repo_url_placeholder', 'https://github.com/anthropics/skills')}
              style={{
                width: '100%', padding: '8px 11px', fontSize: 13,
                border: '1px solid var(--border)', borderRadius: 7,
                backgroundColor: 'var(--bg-tertiary)', color: 'var(--primary-text)',
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleInstall(); }}
                placeholder={t('settings.skills.skill_name_placeholder', 'Skill name (e.g. pptx)')}
                style={{
                  flex: 1, padding: '8px 11px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 7,
                  backgroundColor: 'var(--bg-tertiary)', color: 'var(--primary-text)',
                  outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
              <DomeButton
                variant="ghost"
                size="sm"
                onClick={() => void handleBrowse()}
                leftIcon={browsing ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                disabled={browsing || installing || !url.trim()}
              >
                {t('common.browse', 'Browse')}
              </DomeButton>
              <DomeButton
                variant="secondary"
                size="sm"
                onClick={() => void handleInstall()}
                leftIcon={installing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                disabled={installing || browsing || !url.trim()}
              >
                {t('common.install', 'Install')}
              </DomeButton>
            </div>
          </div>

          {message && (
            <p style={{ fontSize: 12.5, color: message.type === 'success' ? 'var(--success)' : 'var(--error)', marginBottom: repoSkills.length ? 10 : 0 }}>
              {message.text}
            </p>
          )}

          {repoSkills.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tertiary-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {repoSkills.length} {t('settings.skills.skills_found', 'skills found')}
              </span>
              {repoSkills.map((entry) => (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
                  border: '1px solid var(--border)', borderRadius: 7, backgroundColor: 'var(--bg)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--primary-text)' }}>{entry.name}</div>
                    {entry.description && (
                      <div style={{ fontSize: 12, color: 'var(--secondary-text)', marginTop: 2 }}>{entry.description}</div>
                    )}
                  </div>
                  <DomeButton
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleInstallRepoSkill(entry)}
                    leftIcon={installingIds.has(entry.id) ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    disabled={installingIds.has(entry.id)}
                  >
                    {t('common.install', 'Install')}
                  </DomeButton>
                </div>
              ))}
            </div>
          )}
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
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 6, flexShrink: 0, marginTop: 1,
        backgroundColor: 'var(--accent-bg, var(--bg-tertiary))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Zap size={14} color="var(--accent)" strokeWidth={2.2} />
      </div>

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
