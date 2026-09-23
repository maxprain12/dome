'use strict';

/* eslint-disable no-console */

const { BrowserWindow, dialog } = require('electron');
const { z } = require('zod');
const pluginLoader = require('../../marketplace/plugin-loader.cjs');
const { createPluginService } = require('../../plugins/plugin-service.cjs');
const cmsTools = require('../../plugins/cms-tools.cjs');

const pluginIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const repoSchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const assetPathSchema = z.string().min(1).max(500).refine(
  (value) => !value.includes('..') && !value.startsWith('/'),
  'Invalid asset path',
);

function serializeError(error) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || 'Invalid request';
  return error instanceof Error ? error.message : 'Plugin operation failed';
}

function register({ ipcMain, windowManager, sanitizePath, database, fileStorage }) {
  const service = createPluginService({ database, fileStorage, windowManager, pluginLoader });
  cmsTools.setPluginService(service);

  function handle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!windowManager.isAuthorized(event.sender.id)) {
        return { success: false, error: 'Unauthorized' };
      }
      try {
        const result = await handler(event, ...args);
        if (result && typeof result === 'object' && typeof result.success === 'boolean') return result;
        return { success: true, data: result };
      } catch (error) {
        console.error(`[Plugins] ${channel}:`, error);
        return { success: false, error: serializeError(error) };
      }
    });
  }

  handle('plugin:list', () => service.listPlugins());

  handle('plugin:install-from-folder', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
    if (!parent || parent.isDestroyed()) throw new Error('No window available');
    const result = await dialog.showOpenDialog(parent, {
      title: 'Select plugin folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, cancelled: true };
    const sourceDir = sanitizePath(result.filePaths[0], true);
    return pluginLoader.installFromDir(sourceDir);
  });

  handle('plugin:install-from-repo', (_event, repo) => (
    pluginLoader.installFromRepo(repoSchema.parse(repo))
  ));

  handle('plugin:install-bundled', (_event, pluginId) => (
    pluginLoader.installBundled(pluginIdSchema.parse(pluginId))
  ));

  handle('plugin:uninstall', (_event, pluginId) => {
    const id = pluginIdSchema.parse(pluginId);
    service.revoke(id);
    return pluginLoader.uninstall(id);
  });

  handle('plugin:setEnabled', (_event, pluginId, enabled) => {
    const id = pluginIdSchema.parse(pluginId);
    if (typeof enabled !== 'boolean') throw new Error('Enabled must be a boolean');
    if (enabled && !service.getConfiguration(id)) {
      throw new Error('Configure the plugin before enabling it');
    }
    return pluginLoader.setEnabled(id, enabled);
  });

  handle('plugin:read-asset', (_event, pluginId, relativePath) => (
    pluginLoader.readAsset(pluginIdSchema.parse(pluginId), assetPathSchema.parse(relativePath))
  ));

  handle('plugin:configure', (_event, pluginId, configuration) => (
    service.configure(pluginIdSchema.parse(pluginId), configuration)
  ));

  handle('plugin:get-configuration', (_event, pluginId) => (
    service.getConfiguration(pluginIdSchema.parse(pluginId))
  ));

  handle('plugin:revoke', (_event, pluginId) => service.revoke(pluginIdSchema.parse(pluginId)));

  handle('plugin:request', (event, pluginId, method, params) => {
    const parent = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
    if (!parent || parent.isDestroyed()) throw new Error('No window available');
    return service.request(
      pluginIdSchema.parse(pluginId),
      z.string().min(1).max(100).parse(method),
      params,
      parent,
    );
  });

  handle('plugin:get-note-schema', (_event, resourceId) => (
    service.getNoteSchema(z.string().min(1).max(128).parse(resourceId))
  ));

  handle('plugin:update-note-fields', (_event, resourceId, expectedUpdatedAt, fields) => (
    service.updateNoteFields(
      z.string().min(1).max(128).parse(resourceId),
      z.number().int().nonnegative().parse(expectedUpdatedAt),
      fields,
    )
  ));
}

module.exports = { register };
