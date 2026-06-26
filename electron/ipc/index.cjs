/* eslint-disable no-console */
const { ipcMain, nativeTheme } = require('electron');
const { createSecureIpcMain } = require('../core/ipc-guard.cjs');

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
const notesHandlers = require('./data/notes.cjs');
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
const emailHandlers = require('./integrations/email.cjs');
const domeAuthHandlers = require('./integrations/dome-auth.cjs');
const agentTeamHandlers = require('./agents/agent-team.cjs');
const chatHandlers = require('./agents/chat.cjs');
const runsHandlers = require('./agents/runs.cjs');
const pipelinesHandlers = require('./agents/pipelines.cjs');
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
const githubHandlers = require('./integrations/github.cjs');

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

  const secureIpcMain = createSecureIpcMain(ipcMain, windowManager, validateSender);

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  systemHandlers.register({ ipcMain: secureIpcMain, app, windowManager, validateSender, sanitizePath, validateUrl });
  windowHandlers.register({ ipcMain: secureIpcMain, nativeTheme, windowManager, database });
  initHandlers.register({ ipcMain: secureIpcMain, windowManager, initModule, validateSender });
  databaseHandlers.register({ ipcMain: secureIpcMain, windowManager, database, fileStorage, validateSender, initModule, ollamaService });
  interactionsHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  semanticHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender });
  embeddingsHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender });
  cloudLlmHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender });
  tagsHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  graphHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  resourcesHandlers.register({ ipcMain: secureIpcMain, fs, path, crypto, windowManager, database, fileStorage, thumbnail, documentExtractor, documentGenerator, docxConverter, initModule, ollamaService, sanitizePath });
  notesHandlers.register({ ipcMain: secureIpcMain, windowManager, database, fileStorage });
  storageHandlers.register({ ipcMain: secureIpcMain, windowManager, database, fileStorage });
  filesHandlers.register({ ipcMain: secureIpcMain, app, windowManager, sanitizePath });
  migrationHandlers.register({ ipcMain: secureIpcMain, fs, windowManager, database, fileStorage, thumbnail });
  webHandlers.register({ ipcMain: secureIpcMain, windowManager, database, fileStorage, webScraper, youtubeService, ollamaService, initModule });
  imageHandlers.register({ ipcMain: secureIpcMain, windowManager, cropImage });
  ollamaHandlers.register({ ipcMain: secureIpcMain, windowManager, database, ollamaService, getOllamaManager });
  authHandlers.register({ ipcMain: secureIpcMain, windowManager, authManager });
  personalityHandlers.register({ ipcMain: secureIpcMain, windowManager, personalityLoader });
  aiHandlers.register({ ipcMain: secureIpcMain, windowManager, database, ollamaService });
  aiToolsHandlers.register({ ipcMain: secureIpcMain, windowManager, aiToolsHandler });
  flashcardsHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  studioHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  audioHandlers.register({ ipcMain: secureIpcMain, windowManager, database, ttsService });
  notebookHandlers.register({ ipcMain: secureIpcMain, windowManager, notebookPython });
  updaterHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender });
  syncHandlers.register({ ipcMain: secureIpcMain, windowManager, database, fileStorage, validateSender, sanitizePath });
  pluginsHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender, sanitizePath });
  mcpHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  indexingSyncHandlers.register({ ipcMain: secureIpcMain, windowManager, database, fileStorage, validateSender });
  pdfRenderHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  calendarHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender, sanitizePath });
  emailHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender });
  domeAuthHandlers.register({ ipcMain: secureIpcMain, windowManager, database });
  agentTeamHandlers.register({ ipcMain: secureIpcMain, windowManager, database });
  chatHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  runsHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender });
  pipelinesHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  marketplaceHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender, sanitizePath });
  cloudStorageHandlers.register({ ipcMain: secureIpcMain, windowManager, database, fileStorage });
  transcriptionSession.setWindowManager(windowManager);
  transcriptionHandlers.register({
    ipcMain: secureIpcMain,
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
  browserContextHandlers.register({ ipcMain: secureIpcMain, windowManager });
  kbLlmHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  skillsHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender, app });
  shellHandlers.register({ ipcMain: secureIpcMain, windowManager, sanitizePath });
  domeMcpHandlers.register({ ipcMain: secureIpcMain, windowManager, database });
  artifactsHandlers.register({ ipcMain: secureIpcMain, windowManager, database });
  feedersHandlers.register({ ipcMain: secureIpcMain, windowManager, database });
  approvalHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender });
  cloudSyncHandlers.register({ ipcMain: secureIpcMain, windowManager, database, fileStorage });
  threadsHandlers.register({ ipcMain: secureIpcMain, windowManager, validateSender });
  learnHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  quizHandlers.register({ ipcMain: secureIpcMain, windowManager, database, validateSender });
  minimaxFilesHandlers.register({ ipcMain: secureIpcMain, validateSender });
  copilotHandlers.register({ ipcMain: secureIpcMain, windowManager, database });
  githubHandlers.register({ ipcMain: secureIpcMain, windowManager });

}

module.exports = { registerAll };
