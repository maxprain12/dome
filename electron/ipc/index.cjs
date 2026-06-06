/* eslint-disable no-console */
const { ipcMain, nativeTheme } = require('electron');

const systemHandlers = require('./core/system.cjs');
const windowHandlers = require('./core/window.cjs');
const initHandlers = require('./core/init.cjs');
const databaseHandlers = require('./data/database.cjs');
const interactionsHandlers = require('./data/interactions.cjs');
const semanticHandlers = require('./ai/semantic.cjs');
const embeddingsHandlers = require('./ai/embeddings.cjs');
const cloudLlmHandlers = require('./ai/cloud-llm.cjs');
const tagsHandlers = require('./data/tags.cjs');
const graphHandlers = require('./data/graph.cjs');
const resourcesHandlers = require('./data/resources.cjs');
const storageHandlers = require('./data/storage.cjs');
const filesHandlers = require('./data/files.cjs');
const migrationHandlers = require('./core/migration.cjs');
const webHandlers = require('./integrations/web.cjs');
const imageHandlers = require('./media/images.cjs');
const ollamaHandlers = require('./ai/ollama.cjs');
const authHandlers = require('./integrations/auth.cjs');
const personalityHandlers = require('./integrations/personality.cjs');
const aiHandlers = require('./ai/ai.cjs');
const aiToolsHandlers = require('./ai/ai-tools.cjs');
const flashcardsHandlers = require('./learn/flashcards.cjs');
const studioHandlers = require('./learn/studio.cjs');
const audioHandlers = require('./media/audio.cjs');
const notebookHandlers = require('./media/notebook.cjs');
const updaterHandlers = require('./core/updater.cjs');
const syncHandlers = require('./sync/sync.cjs');
const pluginsHandlers = require('./integrations/plugins.cjs');
const mcpHandlers = require('./integrations/mcp.cjs');
const indexingSyncHandlers = require('./sync/indexing-sync.cjs');
const pdfRenderHandlers = require('./media/pdf-render.cjs');
const calendarHandlers = require('./integrations/calendar.cjs');
const domeAuthHandlers = require('./integrations/dome-auth.cjs');
const agentTeamHandlers = require('./agents/agent-team.cjs');
const chatHandlers = require('./agents/chat.cjs');
const runsHandlers = require('./agents/runs.cjs');
const marketplaceHandlers = require('./integrations/marketplace.cjs');
const cloudStorageHandlers = require('./sync/cloud-storage.cjs');
const transcriptionHandlers = require('./media/transcription.cjs');
const transcriptionRecovery = require('../transcription/transcription-recovery.cjs');
const transcriptionSession = require('../transcription/transcription-session.cjs');
const browserContextHandlers = require('./integrations/browser-context.cjs');
const kbLlmHandlers = require('./ai/kb-llm.cjs');
const skillsHandlers = require('./integrations/skills.cjs');
const shellHandlers = require('./core/shell.cjs');
const domeMcpHandlers = require('./integrations/dome-mcp.cjs');
const artifactsHandlers = require('./agents/artifacts.cjs');
const feedersHandlers = require('./integrations/feeders.cjs');
const approvalHandlers = require('./agents/approval.cjs');
const cloudSyncHandlers = require('./sync/cloud-sync.cjs');
const threadsHandlers = require('./agents/threads.cjs');
const learnHandlers = require('./learn/learn.cjs');
const quizHandlers = require('./learn/quiz.cjs');
const minimaxFilesHandlers = require('./media/minimax-files.cjs');
const copilotHandlers = require('./integrations/copilot.cjs');

let _ipcRegistered = false;

/**
 * Register all IPC handlers
 * @param {Object} deps - Shared dependencies
 */
function registerAll(deps) {
  if (_ipcRegistered) {
    console.warn('[IPC] registerAll called more than once — skipping duplicate registration');
    return;
  }
  _ipcRegistered = true;
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
    getOllamaManager,
    aiToolsHandler,
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
    pendingDisplayMediaSources,
  } = deps;

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  systemHandlers.register({ ipcMain, app, windowManager, validateSender, sanitizePath, validateUrl });
  windowHandlers.register({ ipcMain, nativeTheme, windowManager, database });
  initHandlers.register({ ipcMain, windowManager, initModule, validateSender });
  databaseHandlers.register({ ipcMain, windowManager, database, fileStorage, validateSender, initModule, ollamaService });
  interactionsHandlers.register({ ipcMain, windowManager, database, validateSender });
  semanticHandlers.register({ ipcMain, windowManager, validateSender });
  embeddingsHandlers.register({ ipcMain, windowManager, validateSender });
  cloudLlmHandlers.register({ ipcMain, windowManager, validateSender });
  tagsHandlers.register({ ipcMain, windowManager, database, validateSender });
  graphHandlers.register({ ipcMain, windowManager, database, validateSender });
  resourcesHandlers.register({ ipcMain, fs, path, crypto, windowManager, database, fileStorage, thumbnail, documentExtractor, documentGenerator, docxConverter, initModule, ollamaService, sanitizePath });
  storageHandlers.register({ ipcMain, windowManager, database, fileStorage });
  filesHandlers.register({ ipcMain, app, windowManager, sanitizePath });
  migrationHandlers.register({ ipcMain, fs, windowManager, database, fileStorage, thumbnail });
  webHandlers.register({ ipcMain, windowManager, database, fileStorage, webScraper, youtubeService, ollamaService, initModule });
  imageHandlers.register({ ipcMain, windowManager, cropImage });
  ollamaHandlers.register({ ipcMain, windowManager, database, ollamaService, getOllamaManager });
  authHandlers.register({ ipcMain, windowManager, authManager });
  personalityHandlers.register({ ipcMain, windowManager, personalityLoader });
  aiHandlers.register({ ipcMain, windowManager, database, ollamaService });
  aiToolsHandlers.register({ ipcMain, windowManager, aiToolsHandler });
  flashcardsHandlers.register({ ipcMain, windowManager, database, validateSender });
  studioHandlers.register({ ipcMain, windowManager, database, validateSender });
  audioHandlers.register({ ipcMain, windowManager, database, ttsService });
  notebookHandlers.register({ ipcMain, windowManager, notebookPython });
  updaterHandlers.register({ ipcMain, windowManager, validateSender });
  syncHandlers.register({ ipcMain, windowManager, database, fileStorage, validateSender, sanitizePath });
  pluginsHandlers.register({ ipcMain, windowManager, validateSender, sanitizePath });
  mcpHandlers.register({ ipcMain, windowManager, database, validateSender });
  indexingSyncHandlers.register({ ipcMain, windowManager, database, fileStorage, validateSender });
  pdfRenderHandlers.register({ ipcMain, windowManager, database, validateSender });
  calendarHandlers.register({ ipcMain, windowManager, validateSender, sanitizePath });
  domeAuthHandlers.register({ ipcMain, windowManager, database });
  agentTeamHandlers.register({ ipcMain, windowManager, database });
  chatHandlers.register({ ipcMain, windowManager, database, validateSender });
  runsHandlers.register({ ipcMain, windowManager, validateSender });
  marketplaceHandlers.register({ ipcMain, windowManager, validateSender });
  cloudStorageHandlers.register({ ipcMain, windowManager, database, fileStorage });
  transcriptionSession.setWindowManager(windowManager);
  transcriptionHandlers.register({
    ipcMain,
    windowManager,
    database,
    fileStorage,
    aiToolsHandler,
    thumbnail,
    initModule,
    ollamaService,
    pendingDisplayMediaSources,
  });
  // Recover any sessions left mid-flight by a previous crash. Fire-and-forget;
  // recovery logs its own errors and never blocks startup.
  void transcriptionRecovery.runOnStartup({
    database,
    fileStorage,
    windowManager,
    thumbnail,
    initModule,
    ollamaService,
  });
  browserContextHandlers.register({ ipcMain, windowManager });
  kbLlmHandlers.register({ ipcMain, windowManager, database, validateSender });
  skillsHandlers.register({ ipcMain, windowManager, database, validateSender, app });
  shellHandlers.register({ ipcMain, windowManager, sanitizePath });
  domeMcpHandlers.register({ ipcMain, windowManager, database });
  artifactsHandlers.register({ ipcMain, windowManager, database });
  feedersHandlers.register({ ipcMain, windowManager, database });
  approvalHandlers.register({ ipcMain, windowManager, validateSender });
  cloudSyncHandlers.register({ ipcMain, windowManager, database, fileStorage });
  threadsHandlers.register({ ipcMain, windowManager, validateSender });
  learnHandlers.register({ ipcMain, windowManager, database, validateSender });
  quizHandlers.register({ ipcMain, windowManager, database, validateSender });
  minimaxFilesHandlers.register({ ipcMain, validateSender });
  copilotHandlers.register({ ipcMain, windowManager, database });

}

module.exports = { registerAll };
