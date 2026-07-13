import { HugeiconsIcon } from '@hugeicons/react';
import {
  FolderOpenIcon as FolderOpen,
  RefreshIcon as RefreshCw,
  Loading03Icon as Loader2,
  ZapIcon as Zap,
  GithubIcon as Github,
  Search01Icon as Search,
  Download04Icon as Download,
  ChevronDownIcon as ChevronDown,
  ChevronUpIcon as ChevronUp,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

import {
  listSkills,
  openSkillsFolder,
  addSkillsFromRepo,
  browseSkillsRepo,
  type SkillItem,
  type SkillRepoEntry,
} from '@/lib/skills/client';
import SubpageHeader from '@/components/shared/SubpageHeader';
import ListState from '@/components/shared/ListState';
import SettingsPanel from '@/components/settings/SettingsPanel';

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
    <SettingsPanel>
      <SubpageHeader>
  <SubpageHeader.Title>{t('settings.skills.title', 'Skills')}</SubpageHeader.Title>
  <SubpageHeader.Subtitle>{t('settings.skills.subtitle_file', 'Skills live as SKILL.md files in ~/.dome/skills. Each skill is automatically available to every AI agent.')}</SubpageHeader.Subtitle>
</SubpageHeader>

      <div className="flex items-center gap-2 mb-5">
        <Button variant="secondary"
  onClick={() => void openSkillsFolder()}
  size="sm">{<HugeiconsIcon icon={FolderOpen} size={14} />}
          {t('settings.skills.open_personal_dir', 'Open skills folder')}
        </Button>
        <Button variant="ghost"
  onClick={() => void loadData()}
  disabled={loading}
  size="sm">{loading ? <HugeiconsIcon icon={Loader2} size={14} className="animate-spin" /> : <HugeiconsIcon icon={RefreshCw} size={14} />}
          {t('common.refresh', 'Refresh')}
        </Button>
      </div>

      <InstallFromGitHub onInstalled={() => void loadData()} />

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {!loading && skills.length > 0 && (
        <div className="flex items-center justify-between gap-4 mt-5 mb-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('settings.skills.section_configured', 'Configured skills')}
          </span>
          <Badge variant="secondary">{skills.length}</Badge>
        </div>
      )}

      {loading ? (
        <ListState variant="loading" />
      ) : skills.length === 0 ? (
        <ListState
          variant="empty"
          description={t('settings.skills.empty', 'No skills installed. Add SKILL.md files to the skills folder or install from a GitHub repository.')}
        />
      ) : (
        <div className="grid gap-2">
          {skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </SettingsPanel>
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
    <Card className="mb-5 overflow-hidden">
      <Button variant="ghost"
        type="button"
        onClick={() => { setExpanded((e) => !e); setMessage(null); setRepoSkills([]); }}
        className="h-auto w-full justify-between rounded-none px-4 py-3"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Github} data-icon="inline-start" />
          <span className="font-medium">
            {t('settings.skills.install_from_github', 'Install from GitHub')}
          </span>
        </div>
        {expanded ? <HugeiconsIcon icon={ChevronUp} data-icon="inline-end" /> : <HugeiconsIcon icon={ChevronDown} data-icon="inline-end" />}
      </Button>

      {expanded && (
        <CardContent className="grid gap-3 border-t pt-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('settings.skills.github_hint', 'Enter a GitHub repo URL and optional skill name (e.g. pptx). Equivalent to: npx skills add <repo> --skill <name>')}
          </p>

          <div className="grid gap-2">
            <Input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleInstall(); }}
              placeholder={t('settings.skills.repo_url_placeholder', 'https://github.com/anthropics/skills')}
              aria-label={t('settings.skills.repo_url_placeholder', 'https://github.com/anthropics/skills')}
            />
            <div className="flex gap-2">
              <Input
                type="text"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleInstall(); }}
                placeholder={t('settings.skills.skill_name_placeholder', 'Skill name (e.g. pptx)')}
                aria-label={t('settings.skills.skill_name_placeholder', 'Skill name (e.g. pptx)')}
                className="min-w-0 flex-1"
              />
              <Button variant="ghost"
  onClick={() => void handleBrowse()}
  disabled={browsing || installing || !url.trim()}
  size="sm">{browsing ? <HugeiconsIcon icon={Loader2} size={13} className="animate-spin" /> : <HugeiconsIcon icon={Search} size={13} />}
                {t('common.browse', 'Browse')}
              </Button>
              <Button variant="secondary"
  onClick={() => void handleInstall()}
  disabled={installing || browsing || !url.trim()}
  size="sm">{installing ? <HugeiconsIcon icon={Loader2} size={13} className="animate-spin" /> : <HugeiconsIcon icon={Download} size={13} />}
                {t('common.install', 'Install')}
              </Button>
            </div>
          </div>

          {message && <Alert variant={message.type === 'error' ? 'destructive' : 'default'}><AlertDescription>{message.text}</AlertDescription></Alert>}

          {repoSkills.length > 0 && (
            <div className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {repoSkills.length} {t('settings.skills.skills_found', 'skills found')}
              </span>
              {repoSkills.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-xl border bg-background p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{entry.name}</div>
                    {entry.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{entry.description}</div>
                    )}
                  </div>
                  <Button variant="ghost"
  onClick={() => void handleInstallRepoSkill(entry)}
  disabled={installingIds.has(entry.id)}
  size="sm">{installingIds.has(entry.id) ? <HugeiconsIcon icon={Loader2} size={12} className="animate-spin" /> : <HugeiconsIcon icon={Download} size={12} />}
                    {t('common.install', 'Install')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function SkillRow({ skill }: { skill: SkillItem }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HugeiconsIcon icon={Zap} />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm">{skill.name}</CardTitle>
          <Badge variant="outline" className="mt-1 font-mono text-[10px]">{skill.slug}</Badge>
        </div>
      </CardHeader>
      {skill.description && (
        <CardContent className="pt-0">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {skill.description}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
