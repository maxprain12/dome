import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppModal, AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from '@/components/shared/AppModal';
import type { DomePluginInfo, PluginConfiguration } from '@/types/plugin';

interface ProjectOption { id: string; name: string }
interface ContentPathRule { collection: string; language: string; path: string }

const DEFAULT_CONTENT_PATHS: ContentPathRule[] = [
  { collection: 'blog', language: 'es', path: 'src/content/blog/es' },
  { collection: 'blog', language: 'en', path: 'src/content/blog/en' },
  { collection: 'manual', language: 'es', path: 'src/content/manual/es' },
  { collection: 'manual', language: 'en', path: 'src/content/manual/en' },
];

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const supportsContentPaths = plugin.id === 'dome-cms'
    && plugin.contributes?.vaultTemplate?.fields.some((field) => field.id === 'collection' || field.id === 'language');

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
      const configuredPaths = config?.github?.contentPaths;
      if (configuredPaths && Object.keys(configuredPaths).length > 0) {
        setPathRules(Object.entries(configuredPaths).map(([key, path]) => {
          const [collection = '', language = ''] = key.split('/');
          return { collection, language, path };
        }));
      } else if (supportsContentPaths) {
        setPathRules(DEFAULT_CONTENT_PATHS);
      }
    });
  }, [plugin.id, supportsContentPaths]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const configuration: PluginConfiguration = {
      projectId,
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
        },
      } : {}),
    };
    const result = await window.electron.plugins.configure(plugin.id, configuration);
    setSaving(false);
    if (!result.success) {
      setError(result.error || 'Could not configure plugin');
      return;
    }
    onSaved();
  };

  return (
    <AppModal open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AppModalContent size="md">
        <AppModalHeader title={t('settings.plugins.configure_title', { name: plugin.name })} description={t('settings.plugins.configure_description')} />
        <AppModalBody>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="plugin-vault">{t('settings.plugins.vault')}</FieldLabel>
              <Select value={projectId} onValueChange={(value) => setProjectId(value || '')}>
                <SelectTrigger id="plugin-vault" className="w-full"><SelectValue placeholder={t('settings.plugins.vault_placeholder')} /></SelectTrigger>
                <SelectContent><SelectGroup>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <FieldDescription>{t('settings.plugins.vault_description')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{t('settings.plugins.permissions')}</FieldLabel>
              <div className="flex flex-wrap gap-2">{plugin.permissions?.map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}</div>
            </Field>
            {needsGitHub ? <>
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
            </> : null}
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          </FieldGroup>
        </AppModalBody>
        <AppModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => void save()} disabled={!projectId || saving || (needsGitHub && !repo.trim()) || (supportsContentPaths && (pathRules.length === 0 || pathRules.some((rule) => !rule.collection.trim() || !rule.language.trim() || !rule.path.trim())))}>{saving ? t('common.saving', 'Saving…') : t('settings.plugins.grant_access')}</Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
