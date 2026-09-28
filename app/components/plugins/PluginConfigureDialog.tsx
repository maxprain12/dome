import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppModal, AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from '@/components/shared/AppModal';
import { db } from '@/lib/db/client';
import { SITE_PATH_FORMATS } from '@/lib/plugins/fields';
import type { DomePluginInfo, PluginConfiguration, PluginSite, PluginSiteIcon } from '@/types/plugin';

interface ProjectOption { id: string; name: string }
interface ContentPathRule { collection: string; language: string; path: string }
interface SiteDraft {
  id: string;
  name: string;
  projectId: string;
  repo: string;
  branch: string;
  pathRules: ContentPathRule[];
  siteUrl: string;
  sitePathPattern: string;
  icon: PluginSiteIcon | null;
  iconError: string | null;
  detecting: boolean;
}

const DEFAULT_CONTENT_PATHS: ContentPathRule[] = [
  { collection: 'blog', language: 'es', path: 'src/content/blog/es' },
  { collection: 'blog', language: 'en', path: 'src/content/blog/en' },
  { collection: 'manual', language: 'es', path: 'src/content/manual/es' },
  { collection: 'manual', language: 'en', path: 'src/content/manual/en' },
];
const ICON_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_ICON_BYTES = 128 * 1024;

function clonePaths(rules: ContentPathRule[] = DEFAULT_CONTENT_PATHS): ContentPathRule[] {
  return rules.map((rule) => ({ ...rule }));
}

function rulesFromPaths(contentPaths?: Record<string, string>): ContentPathRule[] {
  if (!contentPaths || Object.keys(contentPaths).length === 0) return clonePaths();
  return Object.entries(contentPaths).map(([key, path]) => {
    const [collection = '', language = ''] = key.split('/');
    return { collection, language, path };
  });
}

function blankSite(projectId = ''): SiteDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    projectId,
    repo: '',
    branch: 'main',
    pathRules: clonePaths(),
    siteUrl: '',
    sitePathPattern: '/{collection}/{slug}',
    icon: null,
    iconError: null,
    detecting: false,
  };
}

function draftFromSite(site: PluginSite): SiteDraft {
  return {
    id: site.id === 'legacy' ? crypto.randomUUID() : site.id,
    name: site.name === 'Site' ? '' : site.name,
    projectId: site.projectId,
    repo: site.github?.repo || '',
    branch: site.github?.branch || 'main',
    pathRules: rulesFromPaths(site.github?.contentPaths),
    siteUrl: site.github?.siteUrl || '',
    sitePathPattern: site.github?.sitePathPattern || '/{collection}/{slug}',
    icon: site.icon || null,
    iconError: null,
    detecting: false,
  };
}

function SitePathFormatField({ id, value, onChange }: {
  id: string;
  value: string;
  onChange: (pattern: string) => void;
}) {
  const { t } = useTranslation();
  const selected = SITE_PATH_FORMATS.find((item) => item.pattern === value);
  const formatLabel = (formatId: string) => t(`settings.plugins.site_path_format_${formatId}`);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t('settings.plugins.site_path_pattern')}</FieldLabel>
      <Select
        value={selected?.pattern || 'custom'}
        onValueChange={(next) => { if (next && next !== 'custom') onChange(next); }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{selected ? formatLabel(selected.id) : t('settings.plugins.site_path_format_custom')}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {SITE_PATH_FORMATS.map((item) => (
              <SelectItem key={item.id} value={item.pattern}>{formatLabel(item.id)}</SelectItem>
            ))}
            <SelectItem value="custom">{t('settings.plugins.site_path_format_custom')}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        aria-label={t('settings.plugins.site_path_pattern')}
        value={value}
        placeholder="/{collection}/{slug}"
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription>{t('settings.plugins.site_path_pattern_description')}</FieldDescription>
    </Field>
  );
}

function VaultNameRow({ id, value, creating, label, placeholder, onChange, onCreate }: {
  id: string;
  value: string;
  creating: boolean;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCreate();
          }
        }}
      />
      <Button type="button" variant="outline" disabled={creating || !value.trim()} onClick={onCreate}>
        {label}
      </Button>
    </div>
  );
}

function hostFromUrl(siteUrl: string): string {
  try {
    return new URL(siteUrl.trim()).host;
  } catch {
    return '';
  }
}

export default function PluginConfigureDialog({ plugin, onClose, onSaved }: {
  plugin: DomePluginInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const needsGitHub = plugin.permissions?.includes('content.publish') ?? false;
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [pathPrefix, setPathPrefix] = useState('src/content/posts');
  const [pathRules, setPathRules] = useState<ContentPathRule[]>(DEFAULT_CONTENT_PATHS);
  const [siteUrl, setSiteUrl] = useState('');
  const [sitePathPattern, setSitePathPattern] = useState('/{collection}/{slug}');
  const [sites, setSites] = useState<SiteDraft[]>([]);
  const [vaultNames, setVaultNames] = useState<Record<string, string>>({});
  const [creatingVaultFor, setCreatingVaultFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const supportsContentPaths = plugin.id === 'dome-cms'
    && plugin.contributes?.vaultTemplate?.fields.some((field) => field.id === 'collection' || field.id === 'language');
  const showSites = supportsContentPaths && needsGitHub;

  useEffect(() => {
    void Promise.all([
      window.electron.db.projects.getAll(),
      window.electron.plugins.getConfiguration(plugin.id),
    ]).then(([projectResult, configResult]) => {
      const options = (projectResult.data || []).map((project) => ({ id: project.id, name: project.name }));
      setProjects(options);
      const config = configResult.data;
      setProjectId(config?.projectId || options[0]?.id || '');
      setRepo(config?.github?.repo || '');
      setBranch(config?.github?.branch || 'main');
      setPathPrefix(config?.github?.pathPrefix || 'src/content/posts');
      setSiteUrl(config?.github?.siteUrl || '');
      setSitePathPattern(config?.github?.sitePathPattern || '/{collection}/{slug}');
      const configuredPaths = config?.github?.contentPaths;
      if (configuredPaths && Object.keys(configuredPaths).length > 0) {
        setPathRules(Object.entries(configuredPaths).map(([key, path]) => {
          const [collection = '', language = ''] = key.split('/');
          return { collection, language, path };
        }));
      } else if (supportsContentPaths) {
        setPathRules(DEFAULT_CONTENT_PATHS);
      }
      if (showSites) {
        const loaded = config?.sites?.length
          ? config.sites.map((site) => draftFromSite(site))
          : [blankSite(config?.projectId || options[0]?.id || '')];
        setSites(loaded);
      }
    });
  }, [plugin.id, showSites, supportsContentPaths]);

  const projectName = (id: string) => projects.find((project) => project.id === id)?.name || '';

  const resolvedName = (site: SiteDraft) => {
    const trimmed = site.name.trim();
    if (trimmed) return trimmed;
    return hostFromUrl(site.siteUrl) || projectName(site.projectId);
  };

  const updateSite = (id: string, patch: Partial<SiteDraft>) => {
    setSites((current) => current.map((site) => site.id === id ? { ...site, ...patch } : site));
  };

  const detectIcon = async (site: SiteDraft, force = false) => {
    const url = site.siteUrl.trim();
    if (!url) return;
    if (!force && site.icon?.source === 'custom') return;
    updateSite(site.id, { detecting: true, iconError: null });
    const result = await window.electron.plugins.detectFavicon(url);
    setSites((current) => current.map((item) => {
      if (item.id !== site.id) return item;
      if (!force && item.icon?.source === 'custom') return { ...item, detecting: false };
      if (!result.success || !result.data) {
        return { ...item, detecting: false, iconError: result.error || t('settings.plugins.favicon_error') };
      }
      return { ...item, detecting: false, icon: result.data, iconError: null };
    }));
  };

  const chooseIcon = (site: SiteDraft, file: File | undefined) => {
    if (!file) return;
    if (!ICON_MIME.has(file.type) || file.size > MAX_ICON_BYTES) {
      updateSite(site.id, { iconError: t('settings.plugins.icon_error') });
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl.startsWith('data:image/')) {
        updateSite(site.id, { iconError: t('settings.plugins.icon_error') });
        return;
      }
      updateSite(site.id, { icon: { source: 'custom', dataUrl }, iconError: null });
    });
    reader.readAsDataURL(file);
  };

  const siteInvalid = (site: SiteDraft) => !resolvedName(site)
    || !site.repo.trim()
    || site.pathRules.length === 0
    || site.pathRules.some((rule) => !rule.collection.trim() || !rule.language.trim() || !rule.path.trim());

  const rememberProject = (option: ProjectOption, known: ProjectOption[]) => {
    const next = [...known.filter((project) => project.id !== option.id), option]
      .sort((left, right) => left.name.localeCompare(right.name));
    setProjects(next);
    return next;
  };

  const createNamedVault = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error(t('settings.plugins.vault_create_error'));
    const result = await db.createProject({ name: trimmed });
    if (!result.success || !result.data) throw new Error(result.error || t('settings.plugins.vault_create_error'));
    return { id: result.data.id, name: result.data.name };
  };

  const reusableVault = (name: string, known: ProjectOption[], used: Set<string>) => known.find((project) => (
    !used.has(project.id) && project.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0
  ));

  const ensureVault = async (name: string, known: ProjectOption[], used: Set<string>) => {
    const existing = reusableVault(name, known, used);
    if (existing) return { id: existing.id, known };
    const created = await createNamedVault(name);
    return { id: created.id, known: rememberProject(created, known) };
  };

  const assignCustomVault = async (targetId: string, assign: (projectId: string) => void) => {
    const name = vaultNames[targetId]?.trim() || '';
    if (!name || creatingVaultFor) return;
    setCreatingVaultFor(targetId);
    setError(null);
    try {
      const used = new Set(showSites
        ? sites.filter((site) => site.id !== targetId && site.projectId).map((site) => site.projectId)
        : []);
      const { id, known } = await ensureVault(name, projects, used);
      if (known !== projects) setProjects(known);
      assign(id);
      setVaultNames((current) => ({ ...current, [targetId]: '' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.plugins.vault_create_error'));
    } finally {
      setCreatingVaultFor(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
    let known = projects;
    const used = new Set<string>();
    const readySites = [];
    if (showSites) {
      for (const site of sites) {
        let nextProjectId = site.projectId;
        if (!nextProjectId) {
          const ensured = await ensureVault(resolvedName(site), known, used);
          nextProjectId = ensured.id;
          known = ensured.known;
        }
        if (used.has(nextProjectId)) throw new Error(t('settings.plugins.vault_create_error'));
        used.add(nextProjectId);
        readySites.push({ ...site, projectId: nextProjectId });
      }
    }
    let readyProjectId = projectId;
    if (!showSites && !readyProjectId) {
      const ensured = await ensureVault(plugin.name, known, used);
      readyProjectId = ensured.id;
      known = ensured.known;
    }
    const configuration: PluginConfiguration = showSites
      ? {
        projectId: readySites[0]?.projectId || '',
        permissions: plugin.permissions || [],
        sites: readySites.map((site) => ({
          id: site.id,
          name: resolvedName(site),
          projectId: site.projectId,
          github: {
            repo: site.repo.trim(),
            branch: site.branch.trim() || 'main',
            contentPaths: Object.fromEntries(site.pathRules.map((rule) => [
              `${rule.collection.trim()}/${rule.language.trim()}`,
              rule.path.trim(),
            ])),
            ...(site.siteUrl.trim() ? { siteUrl: site.siteUrl.trim() } : {}),
            sitePathPattern: site.sitePathPattern.trim() || '/{collection}/{slug}',
          },
          ...(site.icon ? { icon: site.icon } : {}),
        })),
      }
      : {
        projectId: readyProjectId,
        permissions: plugin.permissions || [],
        ...(needsGitHub ? {
          github: {
            repo: repo.trim(),
            branch: branch.trim(),
            ...(!supportsContentPaths ? { pathPrefix: pathPrefix.trim() || undefined } : {}),
            ...(supportsContentPaths ? {
              contentPaths: Object.fromEntries(pathRules.map((rule) => [
                `${rule.collection.trim()}/${rule.language.trim()}`,
                rule.path.trim(),
              ])),
            } : {}),
            ...(siteUrl.trim() ? { siteUrl: siteUrl.trim() } : {}),
            sitePathPattern: sitePathPattern.trim() || '/{collection}/{slug}',
          },
        } : {}),
      };
    const result = await window.electron.plugins.configure(plugin.id, configuration);
    if (!result.success) {
      setError(result.error || 'Could not configure plugin');
      return;
    }
    onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.plugins.vault_create_error'));
    } finally {
      setSaving(false);
    }
  };

  const pathsInvalid = supportsContentPaths && (pathRules.length === 0 || pathRules.some((rule) => !rule.collection.trim() || !rule.language.trim() || !rule.path.trim()));
  const saveDisabled = saving
    || (showSites ? sites.length === 0 || sites.some(siteInvalid) : (needsGitHub && !repo.trim()) || pathsInvalid);

  return (
    <AppModal open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AppModalContent size={showSites ? 'xl' : 'md'} className={showSites ? 'max-h-[min(90vh,860px)]' : undefined}>
        <AppModalHeader title={t('settings.plugins.configure_title', { name: plugin.name })} description={t('settings.plugins.configure_description')} />
        <AppModalBody>
          <FieldGroup>
            {showSites ? null : (
              <Field>
                <FieldLabel htmlFor="plugin-vault">{t('settings.plugins.vault')}</FieldLabel>
                <Select value={projectId} onValueChange={(value) => setProjectId(value || '')}>
                  <SelectTrigger id="plugin-vault" className="w-full">
                    <SelectValue placeholder={t('settings.plugins.vault_placeholder')}>
                      {projectName(projectId) || t('settings.plugins.vault_placeholder')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent><SelectGroup>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                <VaultNameRow
                  id="plugin-vault-name"
                  value={vaultNames.plugin || ''}
                  creating={creatingVaultFor === 'plugin'}
                  label={t('settings.plugins.create_vault')}
                  placeholder={t('settings.plugins.vault_name_placeholder')}
                  onChange={(value) => setVaultNames((current) => ({ ...current, plugin: value }))}
                  onCreate={() => { void assignCustomVault('plugin', setProjectId).catch(() => {}); }}
                />
                <FieldDescription>{t('settings.plugins.vault_description')}</FieldDescription>
                <FieldDescription>{t('settings.plugins.vault_auto_hint')}</FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel>{t('settings.plugins.permissions')}</FieldLabel>
              <div className="flex flex-wrap gap-2">{plugin.permissions?.map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}</div>
            </Field>
            {showSites ? (
              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>{t('settings.plugins.websites')}</FieldLabel>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSites((current) => [...current, blankSite()])}>
                    {t('settings.plugins.add_website')}
                  </Button>
                </div>
                <div className="flex flex-col gap-3">
                  {sites.map((site) => {
                    const usedVaults = new Set(sites.filter((item) => item.id !== site.id).map((item) => item.projectId));
                    const vaultOptions = projects.filter((project) => project.id === site.projectId || !usedVaults.has(project.id));
                    return (
                      <div key={site.id} className="flex flex-col gap-3 rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{resolvedName(site) || t('settings.plugins.website_name')}</p>
                          {sites.length > 1 ? (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setSites((current) => current.filter((item) => item.id !== site.id))}>
                              {t('settings.plugins.remove_website')}
                            </Button>
                          ) : null}
                        </div>
                        <Field>
                          <FieldLabel htmlFor={`plugin-site-name-${site.id}`}>{t('settings.plugins.website_name')}</FieldLabel>
                          <Input
                            id={`plugin-site-name-${site.id}`}
                            value={site.name}
                            placeholder={hostFromUrl(site.siteUrl) || projectName(site.projectId) || t('settings.plugins.website_name_placeholder')}
                            onChange={(event) => updateSite(site.id, { name: event.target.value })}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`plugin-site-vault-${site.id}`}>{t('settings.plugins.vault')}</FieldLabel>
                          <Select value={site.projectId} onValueChange={(value) => updateSite(site.id, { projectId: value || '' })}>
                            <SelectTrigger id={`plugin-site-vault-${site.id}`} className="w-full">
                              <SelectValue placeholder={t('settings.plugins.vault_placeholder')}>
                                {projectName(site.projectId) || t('settings.plugins.vault_placeholder')}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {vaultOptions.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <VaultNameRow
                            id={`plugin-site-vault-name-${site.id}`}
                            value={vaultNames[site.id] || ''}
                            creating={creatingVaultFor === site.id}
                            label={t('settings.plugins.create_vault')}
                            placeholder={resolvedName(site) || t('settings.plugins.vault_name_placeholder')}
                            onChange={(value) => setVaultNames((current) => ({ ...current, [site.id]: value }))}
                            onCreate={() => { void assignCustomVault(site.id, (nextId) => updateSite(site.id, { projectId: nextId })).catch(() => {}); }}
                          />
                          <FieldDescription>{t('settings.plugins.website_vault_description')}</FieldDescription>
                          <FieldDescription>{t('settings.plugins.vault_auto_hint')}</FieldDescription>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`plugin-site-repo-${site.id}`}>{t('settings.plugins.repository')}</FieldLabel>
                          <Input id={`plugin-site-repo-${site.id}`} value={site.repo} placeholder="owner/astro-site" onChange={(event) => updateSite(site.id, { repo: event.target.value })} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`plugin-site-branch-${site.id}`}>{t('settings.plugins.branch')}</FieldLabel>
                          <Input id={`plugin-site-branch-${site.id}`} value={site.branch} onChange={(event) => updateSite(site.id, { branch: event.target.value })} />
                        </Field>
                        <Field>
                          <div className="flex items-center justify-between gap-3">
                            <FieldLabel>{t('settings.plugins.content_paths')}</FieldLabel>
                            <Button type="button" variant="outline" size="sm" onClick={() => updateSite(site.id, { pathRules: [...site.pathRules, { collection: '', language: '', path: 'src/content/' }] })}>
                              {t('settings.plugins.add_content_path')}
                            </Button>
                          </div>
                          <FieldDescription>{t('settings.plugins.content_paths_description')}</FieldDescription>
                          <div className="flex flex-col gap-2">
                            {site.pathRules.map((rule, ruleIndex) => (
                              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]" key={`${site.id}-${ruleIndex}`}>
                                <Input aria-label={t('settings.plugins.collection')} placeholder={t('settings.plugins.collection')} value={rule.collection} onChange={(event) => updateSite(site.id, { pathRules: site.pathRules.map((item, itemIndex) => itemIndex === ruleIndex ? { ...item, collection: event.target.value } : item) })} />
                                <Input aria-label={t('settings.plugins.language')} placeholder={t('settings.plugins.language')} value={rule.language} onChange={(event) => updateSite(site.id, { pathRules: site.pathRules.map((item, itemIndex) => itemIndex === ruleIndex ? { ...item, language: event.target.value } : item) })} />
                                <Input aria-label={t('settings.plugins.content_folder')} placeholder="src/content/blog/es" value={rule.path} onChange={(event) => updateSite(site.id, { pathRules: site.pathRules.map((item, itemIndex) => itemIndex === ruleIndex ? { ...item, path: event.target.value } : item) })} />
                                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('settings.plugins.remove_content_path')} onClick={() => updateSite(site.id, { pathRules: site.pathRules.filter((_item, itemIndex) => itemIndex !== ruleIndex) })}>×</Button>
                              </div>
                            ))}
                          </div>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`plugin-site-url-${site.id}`}>{t('settings.plugins.site_url')}</FieldLabel>
                          <Input
                            id={`plugin-site-url-${site.id}`}
                            value={site.siteUrl}
                            placeholder={t('settings.plugins.site_url_placeholder')}
                            onChange={(event) => updateSite(site.id, { siteUrl: event.target.value })}
                            onBlur={(event) => {
                              const url = event.target.value.trim();
                              if (!url && site.icon?.source === 'favicon') {
                                updateSite(site.id, { icon: null, iconError: null });
                                return;
                              }
                              if (site.icon?.source === 'custom') return;
                              if (url === site.siteUrl.trim() && site.icon) return;
                              void detectIcon({ ...site, siteUrl: url }).catch(() => {});
                            }}
                          />
                          <FieldDescription>{t('settings.plugins.site_url_description')}</FieldDescription>
                        </Field>
                        <SitePathFormatField
                          id={`plugin-site-pattern-${site.id}`}
                          value={site.sitePathPattern}
                          onChange={(pattern) => updateSite(site.id, { sitePathPattern: pattern })}
                        />
                        <Field>
                          <FieldLabel>{t('settings.plugins.site_icon')}</FieldLabel>
                          <FieldDescription>{t('settings.plugins.site_icon_description')}</FieldDescription>
                          <div className="flex flex-wrap items-center gap-2">
                            {site.icon ? <img src={site.icon.dataUrl} alt="" className="size-8 rounded-sm border bg-muted object-contain" /> : <div className="size-8 rounded-sm border bg-muted" />}
                            <Button type="button" variant="outline" size="sm" disabled={!site.siteUrl.trim() || site.detecting} onClick={() => { void detectIcon(site, true).catch(() => {}); }}>
                              {site.detecting ? t('settings.plugins.detecting_favicon') : t('settings.plugins.detect_favicon')}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const input = globalThis.document.getElementById(`plugin-site-icon-${site.id}`);
                                if (input instanceof HTMLInputElement) input.click();
                              }}
                            >
                              {t('settings.plugins.choose_icon')}
                            </Button>
                            <input
                              id={`plugin-site-icon-${site.id}`}
                              className="sr-only"
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              onChange={(event) => {
                                chooseIcon(site, event.target.files?.[0]);
                                event.target.value = '';
                              }}
                            />
                          </div>
                          {site.iconError ? <p className="text-xs text-destructive">{site.iconError}</p> : null}
                        </Field>
                      </div>
                    );
                  })}
                </div>
              </Field>
            ) : null}
            {!showSites && needsGitHub ? <>
              <Field><FieldLabel htmlFor="plugin-repo">{t('settings.plugins.repository')}</FieldLabel><Input id="plugin-repo" value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="owner/astro-site" /></Field>
              <Field><FieldLabel htmlFor="plugin-branch">{t('settings.plugins.branch')}</FieldLabel><Input id="plugin-branch" value={branch} onChange={(event) => setBranch(event.target.value)} /></Field>
              {supportsContentPaths ? (
                <Field>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel>{t('settings.plugins.content_paths')}</FieldLabel>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPathRules((rules) => [...rules, { collection: '', language: '', path: 'src/content/' }])}>
                      {t('settings.plugins.add_content_path')}
                    </Button>
                  </div>
                  <FieldDescription>{t('settings.plugins.content_paths_description')}</FieldDescription>
                  <div className="flex flex-col gap-2">
                    {pathRules.map((rule, index) => (
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]" key={`${index}-${rule.collection}-${rule.language}`}>
                        <Input aria-label={t('settings.plugins.collection')} placeholder={t('settings.plugins.collection')} value={rule.collection} onChange={(event) => setPathRules((rules) => rules.map((item, itemIndex) => itemIndex === index ? { ...item, collection: event.target.value } : item))} />
                        <Input aria-label={t('settings.plugins.language')} placeholder={t('settings.plugins.language')} value={rule.language} onChange={(event) => setPathRules((rules) => rules.map((item, itemIndex) => itemIndex === index ? { ...item, language: event.target.value } : item))} />
                        <Input aria-label={t('settings.plugins.content_folder')} placeholder="src/content/blog/es" value={rule.path} onChange={(event) => setPathRules((rules) => rules.map((item, itemIndex) => itemIndex === index ? { ...item, path: event.target.value } : item))} />
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('settings.plugins.remove_content_path')} onClick={() => setPathRules((rules) => rules.filter((_item, itemIndex) => itemIndex !== index))}>×</Button>
                      </div>
                    ))}
                  </div>
                </Field>
              ) : (
                <Field><FieldLabel htmlFor="plugin-path">{t('settings.plugins.content_folder')}</FieldLabel><Input id="plugin-path" value={pathPrefix} onChange={(event) => setPathPrefix(event.target.value)} /><FieldDescription>{t('settings.plugins.content_folder_description')}</FieldDescription></Field>
              )}
              <Field>
                <FieldLabel htmlFor="plugin-site-url">{t('settings.plugins.site_url')}</FieldLabel>
                <Input
                  id="plugin-site-url"
                  value={siteUrl}
                  onChange={(event) => setSiteUrl(event.target.value)}
                  placeholder={t('settings.plugins.site_url_placeholder')}
                />
                <FieldDescription>{t('settings.plugins.site_url_description')}</FieldDescription>
              </Field>
              <SitePathFormatField id="plugin-site-pattern" value={sitePathPattern} onChange={setSitePathPattern} />
            </> : null}
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          </FieldGroup>
        </AppModalBody>
        <AppModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => { void save().catch(() => {}); }} disabled={saveDisabled}>{saving ? t('common.saving') : t('settings.plugins.grant_access')}</Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
