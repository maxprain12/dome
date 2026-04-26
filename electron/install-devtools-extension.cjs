'use strict';

/**
 * Instala extensiones de la Chrome Web Store usando ses.extensions.* (Electron 41+).
 * electron-devtools-installer@4.0.0 aún llama a session.loadExtension / getAllExtensions (deprecados).
 */

const { session } = require('electron');
const { downloadChromeExtension } = require('electron-devtools-installer/dist/downloadChromeExtension');

/**
 * @param {string | { id: string }} extensionReference
 * @param {{ forceDownload?: boolean, loadExtensionOptions?: object, session?: object }} [options]
 */
async function installExtensionFromChromeStore(extensionReference, options = {}) {
  const { forceDownload, loadExtensionOptions, session: sessionOption } = options;
  const targetSession = sessionOption || session.defaultSession;
  const extensionsApi = targetSession.extensions;

  if (process.type !== 'browser') {
    return Promise.reject(
      new Error('installExtensionFromChromeStore can only be used from the main process'),
    );
  }

  let chromeStoreId;
  if (typeof extensionReference === 'object' && extensionReference && extensionReference.id) {
    chromeStoreId = extensionReference.id;
  } else if (typeof extensionReference === 'string') {
    chromeStoreId = extensionReference;
  } else {
    throw new Error(`Invalid extensionReference passed in: "${extensionReference}"`);
  }

  const installedExtension = extensionsApi.getAllExtensions().find((e) => e.id === chromeStoreId);
  if (!forceDownload && installedExtension) {
    return installedExtension;
  }

  const extensionFolder = await downloadChromeExtension(chromeStoreId, {
    forceDownload: forceDownload || false,
  });

  if (installedExtension?.id) {
    const unloadPromise = new Promise((resolve) => {
      const handler = (_event, ext) => {
        if (ext.id === installedExtension.id) {
          extensionsApi.removeListener('extension-unloaded', handler);
          resolve(undefined);
        }
      };
      extensionsApi.on('extension-unloaded', handler);
    });
    extensionsApi.removeExtension(installedExtension.id);
    await unloadPromise;
  }

  return extensionsApi.loadExtension(extensionFolder, loadExtensionOptions);
}

module.exports = { installExtensionFromChromeStore };
