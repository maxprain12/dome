import i18n from '@/lib/i18n';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import { useTabStore } from '@/lib/store/useTabStore';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IpcResult = { success?: boolean; error?: string; data?: unknown };

let navigateTo: ((path: string) => void) | null = null;

/** Registered by the app shell so studio links can return to the home route. */
export function setDomeHrefNavigate(navigate: ((path: string) => void) | null): void {
  navigateTo = navigate;
}

function electronApi() {
  if (typeof window === 'undefined') return null;
  return window.electron ?? null;
}

function resultError(result: IpcResult | null | undefined, fallback: string): string {
  return typeof result?.error === 'string' && result.error.trim() ? result.error : fallback;
}

async function openExternal(href: string): Promise<void> {
  const electron = electronApi();
  if (!electron?.invoke) {
    showToast('error', i18n.t('toast.links_desktop_only'));
    return;
  }
  try {
    const result = await electron.invoke('open-external-url', href) as IpcResult | undefined;
    if (result && typeof result === 'object' && 'success' in result && !result.success) {
      showToast('error', resultError(result, i18n.t('toast.external_link_error')));
    }
  } catch (err) {
    console.error('[openDomeHref] Failed to open external URL:', err);
    showToast('error', i18n.t('toast.external_link_error'));
  }
}

async function openFolder(folderId: string): Promise<void> {
  const electron = electronApi();
  try {
    if (electron?.db?.resources?.getById) {
      const result = await electron.db.resources.getById(folderId);
      if (result?.success && result.data) {
        const folder = result.data as { title?: string; project_id?: string };
        useTabStore.getState().openFolderTab(folderId, folder.title || 'Carpeta', undefined, folder.project_id);
        return;
      }
      showToast('error', i18n.t('toast.resource_not_found'));
      return;
    }
  } catch {
    /* Fall through to a generic folder tab. */
  }
  useTabStore.getState().openFolderTab(folderId, 'Carpeta', undefined, useAppStore.getState().currentProject?.id);
}

async function openPerson(personId: string): Promise<void> {
  const electron = electronApi();
  if (!electron?.invoke) {
    showToast('error', i18n.t('toast.links_desktop_only'));
    return;
  }
  try {
    const lookup = await electron.people?.get?.(personId);
    const person = lookup?.success ? lookup.data?.person : null;
    if (!person) {
      showToast('error', i18n.t('toast.resource_not_found'));
      return;
    }
    const identities = Array.isArray(person.identities) ? person.identities : [];
    const hasEmail = identities.some((identity) => identity.source === 'email') || !!person.primaryEmail;
    const hasGithub = identities.some((identity) => identity.source === 'github');
    if (hasEmail) useTabStore.getState().openEmailTab();
    else if (hasGithub) useTabStore.getState().openGitHubTab();
    const identityText = identities
      .map((identity) => `${identity.source}:${identity.externalId}`)
      .slice(0, 2)
      .join(', ');
    showToast('success', identityText ? `${person.displayName} · ${identityText}` : person.displayName);
  } catch (err) {
    console.error('[openDomeHref] Failed to resolve person:', err);
    showToast('error', i18n.t('toast.internal_link_error'));
  }
}

async function openResource(href: string): Promise<void> {
  const electron = electronApi();
  if (!electron?.invoke) {
    showToast('error', i18n.t('toast.links_desktop_only'));
    return;
  }
  const resourceMatch = href.match(/^dome:\/\/resource\/([^/]+)(?:\/([^?#]+))?/);
  if (!resourceMatch) return;
  const [, resourceId, explicitType] = resourceMatch;
  let resourceType = explicitType?.trim();
  let resourceTitle = 'Recurso';
  if (electron.db?.resources?.getById) {
    try {
      const lookup = await electron.db.resources.getById(resourceId);
      if (lookup?.success && lookup.data) {
        const data = lookup.data as { type?: string; title?: string };
        resourceTitle = data.title || 'Recurso';
        resourceType = data.type || resourceType || 'url';
      } else if (!resourceType) {
        showToast('error', resultError(lookup, i18n.t('toast.resource_not_found')));
        return;
      }
    } catch (err) {
      console.error('[openDomeHref] Failed to resolve resource:', err);
      if (!resourceType) {
        showToast('error', i18n.t('toast.resource_not_found'));
        return;
      }
    }
  }
  useTabStore.getState().openResourceTab(resourceId, resourceType || 'url', resourceTitle);
}

async function openResolvedResource(id: string, type: string): Promise<void> {
  if (type === 'folder') {
    await openFolder(id);
    return;
  }
  useTabStore.getState().openResourceTab(id, type, 'Recurso');
}

async function openResolve(href: string): Promise<void> {
  const electron = electronApi();
  if (!electron?.invoke) {
    showToast('error', i18n.t('toast.links_desktop_only'));
    return;
  }
  const resolveMatch = href.match(/^dome:\/\/resolve\/(.+)$/);
  if (!resolveMatch || !electron.db?.resources) {
    if (!electron.db?.resources) showToast('error', i18n.t('toast.internal_link_error'));
    return;
  }
  const resolveSlug = decodeURIComponent(resolveMatch[1]);
  try {
    if (UUID_REGEX.test(resolveSlug)) {
      const lookup = await electron.db.resources.getById(resolveSlug);
      if (lookup?.success && lookup.data) {
        const data = lookup.data as { id: string; type?: string };
        await openResolvedResource(data.id, data.type || 'url');
        return;
      }
    }
    const searchSlug = resolveSlug.replace(/^Ver:\s*/i, '').trim() || resolveSlug;
    const activeProjectId = useAppStore.getState().currentProject?.id ?? 'default';
    const lookup = await electron.db.resources.searchForMention(searchSlug, activeProjectId);
    const results = lookup?.success && Array.isArray(lookup.data) ? lookup.data : [];
    const match = results.find((item) => (item.title ?? '').toLowerCase() === searchSlug.toLowerCase())
      ?? results.find((item) => (item.title ?? '').toLowerCase() === resolveSlug.toLowerCase())
      ?? results[0];
    if (!match) {
      showToast('error', resultError(lookup, i18n.t('toast.resource_not_found')));
      return;
    }
    await openResolvedResource(match.id, match.type || 'url');
  } catch (err) {
    console.error('[openDomeHref] Failed to resolve wikilink:', err);
    showToast('error', i18n.t('toast.internal_link_error'));
  }
}

async function openStudio(href: string): Promise<void> {
  const electron = electronApi();
  if (!electron?.invoke) {
    showToast('error', i18n.t('toast.links_desktop_only'));
    return;
  }
  const studioMatch = href.match(/^dome:\/\/studio\/([^/]+)/);
  if (!studioMatch) return;
  if (!electron.db?.studio?.getById) {
    showToast('error', i18n.t('toast.studio_output_error'));
    return;
  }
  try {
    const result = await electron.db.studio.getById(studioMatch[1]);
    if (!result?.success || !result.data) {
      showToast('error', resultError(result, i18n.t('toast.studio_output_error')));
      return;
    }
    const output = result.data as { id: string; project_id: string; type: string; title: string };
    const app = useAppStore.getState();
    app.addStudioOutput(output as Parameters<typeof app.addStudioOutput>[0]);
    app.setActiveStudioOutput(output as Parameters<typeof app.setActiveStudioOutput>[0]);
    app.setHomeSidebarSection('studio');
    const project = await electron.db.projects.getById(output.project_id);
    if (project?.success && project.data) {
      app.setCurrentProject(project.data as Parameters<typeof app.setCurrentProject>[0]);
    }
    navigateTo?.('/');
  } catch (err) {
    console.error('[openDomeHref] Failed to open studio output:', err);
    showToast('error', i18n.t('toast.studio_output_error'));
  }
}

/** Open a Dome, web or mail link from the editor or rendered Markdown. */
export function openDomeHref(href: string): Promise<void> {
  const value = href.trim();
  if (/^https?:\/\//i.test(value) || value.startsWith('mailto:')) return openExternal(value);
  const folder = value.match(/^dome:\/\/folder\/([^/?#]+)/);
  if (folder) return openFolder(folder[1]);
  const person = value.match(/^dome:\/\/person\/([^/?#]+)/);
  if (person) return openPerson(person[1]);
  if (value.startsWith('dome://resource/')) return openResource(value);
  if (value.startsWith('dome://resolve/')) return openResolve(value);
  if (value.startsWith('dome://studio/')) return openStudio(value);
  return Promise.resolve();
}
