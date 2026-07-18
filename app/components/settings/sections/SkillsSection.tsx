import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Download04Icon,
  FolderOpenIcon,
  GithubIcon,
  MagicWand01Icon,
  RefreshIcon,
  Search01Icon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SettingsGroup, SettingsSurface } from '../blocks';
import {
  listSkills,
  openSkillsFolder,
  addSkillsFromRepo,
  browseSkillsRepo,
  type SkillItem,
  type SkillRepoEntry,
} from '@/lib/skills/client';

export default function SkillsSection() {
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
    <SettingsSurface
      icon={MagicWand01Icon}
      title={t('settings.skills.title', 'Skills')}
      description={t(
        'settings.skills.subtitle_file',
        'Skills live as SKILL.md files in ~/.dome/skills. Each skill is automatically available to every AI agent.',
      )}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => void openSkillsFolder()}>
            <HugeiconsIcon icon={FolderOpenIcon} data-icon="inline-start" />
            {t('settings.skills.open_personal_dir', 'Open skills folder')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void loadData()}
            disabled={loading}
            aria-label={t('common.refresh', 'Refresh')}
            title={t('common.refresh', 'Refresh')}
          >
            {loading ? <Spinner /> : <HugeiconsIcon icon={RefreshIcon} />}
          </Button>
        </>
      }
    >
      <InstallFromGitHub onInstalled={() => void loadData()} />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsGroup
        title={t('settings.skills.section_configured', 'Configured skills')}
        actions={!loading && skills.length > 0 ? <Badge variant="secondary">{skills.length}</Badge> : undefined}
      >
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : skills.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ZapIcon} />
              </EmptyMedia>
              <EmptyTitle>{t('settings.skills.title', 'Skills')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'settings.skills.empty',
                  'No skills installed. Add SKILL.md files to the skills folder or install from a GitHub repository.',
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          skills.map((skill) => (
            <Item key={skill.id} size="sm">
              <ItemMedia>
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <HugeiconsIcon icon={ZapIcon} />
                </span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="flex items-center gap-2">
                  <span className="truncate">{skill.name}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {skill.slug}
                  </Badge>
                </ItemTitle>
                {skill.description ? (
                  <ItemDescription className="line-clamp-2">{skill.description}</ItemDescription>
                ) : null}
              </ItemContent>
            </Item>
          ))
        )}
      </SettingsGroup>
    </SettingsSurface>
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
          text: t('settings.skills.install_success', {
            defaultValue: '✓ "{{name}}" installed successfully.',
            name: label,
          }),
        });
        setUrl('');
        setSkillName('');
        onInstalled();
      } else {
        setMessage({
          type: 'error',
          text: res.error ?? t('settings.skills.install_failed', 'Installation failed.'),
        });
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
          setMessage({
            type: 'error',
            text: t('settings.skills.no_skills_found', 'No skills found in that repository.'),
          });
        } else {
          setRepoSkills(res.data);
        }
      } else {
        setMessage({
          type: 'error',
          text: res.error ?? t('settings.skills.browse_failed', 'Could not browse that repository.'),
        });
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
          text: t('settings.skills.install_success', {
            defaultValue: '✓ "{{name}}" installed successfully.',
            name: entry.name,
          }),
        });
        onInstalled();
      } else {
        setMessage({
          type: 'error',
          text: res.error ?? t('settings.skills.install_failed', 'Installation failed.'),
        });
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
    <Collapsible
      open={expanded}
      onOpenChange={(open) => {
        setExpanded(open);
        setMessage(null);
        setRepoSkills([]);
      }}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50 motion-reduce:transition-none">
        <span className="flex items-center gap-2">
          <HugeiconsIcon icon={GithubIcon} />
          {t('settings.skills.install_from_github', 'Install from GitHub')}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 border-t px-4 py-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t(
            'settings.skills.github_hint',
            'Enter a GitHub repo URL and optional skill name (e.g. pptx). Equivalent to: npx skills add <repo> --skill <name>',
          )}
        </p>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="skills-repo-url">
              {t('settings.skills.repo_url_placeholder', 'https://github.com/anthropics/skills')}
            </FieldLabel>
            <Input
              id="skills-repo-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleInstall();
              }}
              placeholder="https://github.com/anthropics/skills"
            />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleInstall();
              }}
              placeholder={t('settings.skills.skill_name_placeholder', 'Skill name (e.g. pptx)')}
              aria-label={t('settings.skills.skill_name_placeholder', 'Skill name (e.g. pptx)')}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleBrowse()}
              disabled={browsing || installing || !url.trim()}
            >
              {browsing ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" />}
              {t('common.browse', 'Browse')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleInstall()}
              disabled={installing || browsing || !url.trim()}
            >
              {installing ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />}
              {t('common.install', 'Install')}
            </Button>
          </div>
        </FieldGroup>

        {message ? (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}

        {repoSkills.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {repoSkills.length} {t('settings.skills.skills_found', 'skills found')}
            </span>
            <div className="divide-y overflow-hidden rounded-lg border">
              {repoSkills.map((entry) => (
                <Item key={entry.id} size="sm">
                  <ItemContent>
                    <ItemTitle>{entry.name}</ItemTitle>
                    {entry.description ? (
                      <ItemDescription>{entry.description}</ItemDescription>
                    ) : null}
                  </ItemContent>
                  <ItemActions>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleInstallRepoSkill(entry)}
                      disabled={installingIds.has(entry.id)}
                    >
                      {installingIds.has(entry.id) ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
                      )}
                      {t('common.install', 'Install')}
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </div>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
