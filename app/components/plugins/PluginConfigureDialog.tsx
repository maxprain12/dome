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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    });
  }, [plugin.id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const configuration: PluginConfiguration = {
      projectId,
      permissions: plugin.permissions || [],
      ...(needsGitHub ? { github: { repo: repo.trim(), branch: branch.trim(), pathPrefix: pathPrefix.trim() } } : {}),
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
              <Field><FieldLabel htmlFor="plugin-path">{t('settings.plugins.content_folder')}</FieldLabel><Input id="plugin-path" value={pathPrefix} onChange={(event) => setPathPrefix(event.target.value)} /><FieldDescription>{t('settings.plugins.content_folder_description')}</FieldDescription></Field>
            </> : null}
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          </FieldGroup>
        </AppModalBody>
        <AppModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => void save()} disabled={!projectId || saving || (needsGitHub && !repo.trim())}>{saving ? t('common.saving', 'Saving…') : t('settings.plugins.grant_access')}</Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
