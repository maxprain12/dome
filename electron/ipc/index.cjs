/* eslint-disable no-console */
const { ipcMain, nativeTheme } = require('electron');

const systemHandlers = require('./system.cjs');
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
const imageHandlers = require('./images.cjs');
const ollamaHandlers = require('./ollama.cjs');
const whatsappHandlers = require('./whatsapp.cjs');
const authHandlers = require('./auth.cjs');
const personalityHandlers = require('./personality.cjs');
const aiHandlers = require('./ai.cjs');
const aiToolsHandlers = require('./ai-tools.cjs');
const flashcardsHandlers = require('./flashcards.cjs');
const studioHandlers = require('./studio.cjs');
const audioHandlers = require('./audio.cjs');
const notebookHandlers = require('./notebook.cjs');
const updaterHandlers = require('./updater.cjs');
const syncHandlers = require('./sync.cjs');
const pluginsHandlers = require('./plugins.cjs');
const mcpHandlers = require('./mcp.cjs');
const pageIndexHandlers = require('./pageindex.cjs');
const calendarHandlers = require('./calendar.cjs');
const domeAuthHandlers = require('./dome-auth.cjs');
const agentTeamHandlers = require('./agent-team.cjs');
const chatHandlers = require('./chat.cjs');
const runsHandlers = require('./runs.cjs');
const marketplaceHandlers = require('./marketplace.cjs');
const cloudStorageHandlers = require('./cloud-storage.cjs');
const doclingHandlers = require('./docling.cjs');
const transcriptionHandlers = require('./transcription.cjs');
const browserContextHandlers = require('./browser-context.cjs');
const manyVoiceHandlers = require('./many-voice.cjs');
const transcriptionOverlayHandlers = require('./transcription-overlay.cjs');
const realtimeHandlers = require('./realtime.cjs');

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
    cropImage,
    webScraper,
    youtubeService,
    ollamaService,
    ollamaManager,
    aiToolsHandler,
    aiCloudService,
    ttsService,
    documentExtractor,
    documentGenerator,
    docxConverter,
    authManager,
    personalityLoader,
    notebookPython,
    validateSender,
    sanitizePath,
    validateUrl,
  } = deps;

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  systemHandlers.register({ ipcMain, app, windowManager, validateSender, sanitizePath, validateUrl });
  windowHandlers.register({ ipcMain, nativeTheme, windowManager, database });
  initHandlers.register({ ipcMain, windowManager, initModule, validateSender });
  databaseHandlers.register({ ipcMain, windowManager, database, fileStorage, validateSender, initModule, ollamaService });
  interactionsHandlers.register({ ipcMain, windowManager, database, validateSender });
  linksHandlers.register({ ipcMain, windowManager, database, validateSender });
  tagsHandlers.register({ ipcMain, windowManager, database, validateSender });
  graphHandlers.register({ ipcMain, windowManager, database, validateSender });
  resourcesHandlers.register({ ipcMain, fs, path, crypto, windowManager, database, fileStorage, thumbnail, documentExtractor, documentGenerator, docxConverter, initModule, ollamaService });
  storageHandlers.register({ ipcMain, windowManager, database, fileStorage });
  filesHandlers.register({ ipcMain, app, windowManager, sanitizePath });
  migrationHandlers.register({ ipcMain, fs, windowManager, database, fileStorage, thumbnail });
  webHandlers.register({ ipcMain, windowManager, database, fileStorage, webScraper, youtubeService, ollamaService, initModule });
  imageHandlers.register({ ipcMain, windowManager, cropImage });
  ollamaHandlers.register({ ipcMain, windowManager, database, ollamaService, ollamaManager });
  whatsappHandlers.register({ ipcMain, windowManager, database, fileStorage, ollamaService, initModule, aiToolsHandler });
  authHandlers.register({ ipcMain, windowManager, authManager });
  personalityHandlers.register({ ipcMain, windowManager, personalityLoader });
  aiHandlers.register({ ipcMain, windowManager, database, aiCloudService, ollamaService });
  aiToolsHandlers.register({ ipcMain, windowManager, aiToolsHandler });
  flashcardsHandlers.register({ ipcMain, windowManager, database, validateSender });
  studioHandlers.register({ ipcMain, windowManager, database, validateSender });
  audioHandlers.register({ ipcMain, windowManager, database, ttsService });
  notebookHandlers.register({ ipcMain, windowManager, notebookPython });
  updaterHandlers.register({ ipcMain, windowManager, validateSender });
  syncHandlers.register({ ipcMain, windowManager, database, fileStorage, validateSender, sanitizePath });
  pluginsHandlers.register({ ipcMain, windowManager, validateSender, sanitizePath });
  mcpHandlers.register({ ipcMain, windowManager, database, validateSender });
  pageIndexHandlers.register({ ipcMain, windowManager, database, fileStorage, validateSender });
  calendarHandlers.register({ ipcMain, windowManager, validateSender });
  domeAuthHandlers.register({ ipcMain, windowManager, database });
  agentTeamHandlers.register({ ipcMain, windowManager, database, aiCloudService, ollamaService });
  chatHandlers.register({ ipcMain, windowManager, database, validateSender });
  runsHandlers.register({ ipcMain, windowManager, validateSender });
  marketplaceHandlers.register({ ipcMain, windowManager, validateSender });
  cloudStorageHandlers.register({ ipcMain, windowManager, database, fileStorage });
  doclingHandlers.register({ ipcMain, windowManager, database, fileStorage });
  transcriptionHandlers.register({
    ipcMain,
    windowManager,
    database,
    fileStorage,
    aiToolsHandler,
    thumbnail,
    initModule,
    ollamaService,
  });
  browserContextHandlers.register({ ipcMain, windowManager });
  manyVoiceHandlers.register({ ipcMain, windowManager });
  transcriptionOverlayHandlers.register({ ipcMain, windowManager });
  realtimeHandlers.register({ ipcMain, windowManager, database });

}

module.exports = { registerAll };
