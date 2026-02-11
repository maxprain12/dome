/* eslint-disable no-console */
const { ipcMain, nativeTheme } = require('electron');

const systemHandlers = require('./system.cjs');
const avatarHandlers = require('./avatar.cjs');
const windowHandlers = require('./window.cjs');
const initHandlers = require('./init.cjs');
const databaseHandlers = require('./database.cjs');
const interactionsHandlers = require('./interactions.cjs');
const linksHandlers = require('./links.cjs');
const tagsHandlers = require('./tags.cjs');
const graphHandlers = require('./graph.cjs');
const resourcesHandlers = require('./resources.cjs');
const storageHandlers = require('./storage.cjs');
const filesHandlers = require('./files.cjs');
const migrationHandlers = require('./migration.cjs');
const webHandlers = require('./web.cjs');
const ollamaHandlers = require('./ollama.cjs');
const vectorHandlers = require('./vector.cjs');
const whatsappHandlers = require('./whatsapp.cjs');
const authHandlers = require('./auth.cjs');
const personalityHandlers = require('./personality.cjs');
const aiHandlers = require('./ai.cjs');
const aiToolsHandlers = require('./ai-tools.cjs');
const flashcardsHandlers = require('./flashcards.cjs');
const studioHandlers = require('./studio.cjs');
const audioHandlers = require('./audio.cjs');

/**
 * Register all IPC handlers
 * @param {Object} deps - Shared dependencies
 */
function registerAll(deps) {
  const {
    app,
    windowManager,
    database,
    initModule,
    fileStorage,
    thumbnail,
    webScraper,
    youtubeService,
    ollamaService,
    ollamaManager,
    aiToolsHandler,
    aiCloudService,
    ttsService,
    vectorHandler,
    documentExtractor,
    authManager,
    personalityLoader,
    validateSender,
    sanitizePath,
    validateUrl,
  } = deps;

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  systemHandlers.register({ ipcMain, app, windowManager, validateSender, sanitizePath, validateUrl });
  avatarHandlers.register({ ipcMain, app, windowManager, validateSender });
  windowHandlers.register({ ipcMain, nativeTheme, windowManager, database });
  initHandlers.register({ ipcMain, windowManager, initModule, validateSender });
  databaseHandlers.register({ ipcMain, windowManager, database, fileStorage, validateSender });
  interactionsHandlers.register({ ipcMain, windowManager, database, validateSender });
  linksHandlers.register({ ipcMain, windowManager, database, validateSender });
  tagsHandlers.register({ ipcMain, windowManager, database, validateSender });
  graphHandlers.register({ ipcMain, windowManager, database, validateSender });
  resourcesHandlers.register({ ipcMain, fs, path, crypto, windowManager, database, fileStorage, thumbnail, documentExtractor });
  storageHandlers.register({ ipcMain, windowManager, database, fileStorage });
  filesHandlers.register({ ipcMain, app, windowManager, sanitizePath });
  migrationHandlers.register({ ipcMain, fs, windowManager, database, fileStorage, thumbnail });
  webHandlers.register({ ipcMain, windowManager, database, fileStorage, webScraper, youtubeService, ollamaService });
  ollamaHandlers.register({ ipcMain, windowManager, database, ollamaService, ollamaManager });
  vectorHandlers.register({ ipcMain, windowManager, database, ollamaService, initModule });
  whatsappHandlers.register({ ipcMain, windowManager, database, fileStorage, ollamaService });
  authHandlers.register({ ipcMain, windowManager, authManager });
  personalityHandlers.register({ ipcMain, windowManager, personalityLoader });
  aiHandlers.register({ ipcMain, windowManager, database, aiCloudService, ollamaService });
  aiToolsHandlers.register({ ipcMain, windowManager, aiToolsHandler });
  flashcardsHandlers.register({ ipcMain, windowManager, database, validateSender });
  studioHandlers.register({ ipcMain, windowManager, database, validateSender });
  audioHandlers.register({ ipcMain, windowManager, database, ttsService });

  console.log('[IPC] All handlers registered successfully');
}

module.exports = { registerAll };
