/* eslint-disable no-console */
/**
 * Coding workspace IPC — the on-disk repositories the agent may work in.
 *
 * coding:workspace:list    — known workspaces (most recently used first)
 * coding:workspace:pick    — native directory picker; registers the choice
 * coding:workspace:register— register/refresh a workspace by path
 * coding:workspace:trust   — persist the trust decision for a workspace
 * coding:workspace:forget  — drop a workspace from the store
 * coding:repo:setLocalPath — bind a GitHub repo row to a local clone
 */

const { z } = require('zod');
const workspaceStore = require('../../coding/workspace-store.cjs');
const githubStore = require('../../github/github-store.cjs');

const PathPayloadSchema = z.object({
  path: z.string().min(1),
  label: z.string().optional(),
});

const TrustPayloadSchema = z.object({
  path: z.string().min(1),
  trusted: z.boolean(),
});

const SetLocalPathSchema = z.object({
  repoId: z.string().min(1),
  path: z.string().min(1).nullable(),
});

/**
 * Shape a workspace for the renderer, adding whether its directory still exists
 * and which project context files it carries.
 */
function describe(workspace) {
  if (!workspace) return null;
  let exists = true;
  try {
    workspaceStore.assertWorkspaceExists(workspace.path);
  } catch {
    exists = false;
  }
  return {
    ...workspace,
    exists,
    contextFiles: exists ? workspaceStore.listContextFiles(workspace.path).map((f) => f.name) : [],
  };
}

function register({ ipcMain, windowManager, validateSender }) {
  const { dialog } = require('electron');

  ipcMain.handle('coding:workspace:list', (event) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: workspaceStore.listWorkspaces().map(describe) };
    } catch (error) {
      console.error('[Coding] list workspaces failed:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('coding:workspace:pick', async (event, raw) => {
    try {
      validateSender(event, windowManager);
      const label = typeof raw?.label === 'string' ? raw.label : undefined;
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select the local repository',
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { success: true, cancelled: true, data: null };
      }
      const workspace = workspaceStore.registerWorkspace(result.filePaths[0], { label });
      return { success: true, cancelled: false, data: describe(workspace) };
    } catch (error) {
      console.error('[Coding] pick workspace failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('coding:workspace:register', (event, raw) => {
    try {
      validateSender(event, windowManager);
      const parsed = PathPayloadSchema.safeParse(raw ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid payload' };
      const normalized = workspaceStore.assertWorkspaceExists(parsed.data.path);
      const workspace = workspaceStore.registerWorkspace(normalized, { label: parsed.data.label });
      return { success: true, data: describe(workspace) };
    } catch (error) {
      console.error('[Coding] register workspace failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('coding:workspace:trust', (event, raw) => {
    try {
      validateSender(event, windowManager);
      const parsed = TrustPayloadSchema.safeParse(raw ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid payload' };
      if (parsed.data.trusted) workspaceStore.assertWorkspaceExists(parsed.data.path);
      const workspace = workspaceStore.setTrust(parsed.data.path, parsed.data.trusted);
      return { success: true, data: describe(workspace) };
    } catch (error) {
      console.error('[Coding] trust workspace failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('coding:workspace:forget', (event, raw) => {
    try {
      validateSender(event, windowManager);
      const parsed = PathPayloadSchema.safeParse(raw ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid payload' };
      return { success: true, data: { removed: workspaceStore.removeWorkspace(parsed.data.path) } };
    } catch (error) {
      console.error('[Coding] forget workspace failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('coding:repo:setLocalPath', (event, raw) => {
    try {
      validateSender(event, windowManager);
      const parsed = SetLocalPathSchema.safeParse(raw ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid payload' };
      const { repoId, path: rawPath } = parsed.data;
      if (rawPath === null) {
        const repo = githubStore.setRepoLocalPath(repoId, null);
        return { success: true, data: { repo, workspace: null } };
      }
      const normalized = workspaceStore.assertWorkspaceExists(rawPath);
      const repo = githubStore.setRepoLocalPath(repoId, normalized);
      const workspace = workspaceStore.registerWorkspace(normalized, {
        label: repo?.full_name || undefined,
      });
      return { success: true, data: { repo, workspace: describe(workspace) } };
    } catch (error) {
      console.error('[Coding] setLocalPath failed:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
