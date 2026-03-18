/* eslint-disable no-unused-vars */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Log to verify preload script is loading
console.log('[Preload] Script loading...');
console.log('[Preload] Node version:', process.versions.node);
console.log('[Preload] Electron version:', process.versions.electron);
console.log('[Preload] Chrome version:', process.versions.chrome);

/**
 * Electron Handler
 * Expone APIs de Electron de manera segura usando contextBridge
 * Basado en las mejores prácticas de Pile
 */

// Whitelist de canales permitidos para IPC
const ALLOWED_CHANNELS = {
  // Canales para invoke (renderer → main)
  invoke: [
    // System
    'get-user-data-path',
    'get-home-path',
    'get-app-version',
    'open-external-url',
    // File dialogs
    'select-file',
    'select-files',
    'select-folder',
    'show-save-dialog',
    // File system
    'open-path',
    'show-item-in-folder',
    // Theme
    'get-theme',
    'set-theme',
    // System / auto-launch
    'system:get-login-item',
    'system:set-login-item',
    'system:quit',
    // Window management
    'window:create',
    'window:create-modal',
    'window:close',
    'window:minimize-current',
    'window:maximize-toggle',
    'window:close-current',
    'window:list',
    'window:broadcast',
    'window:open-workspace',
    'window:open-folder',
    'window:open-settings',
    // Initialization
    'init:initialize',
    'init:check-onboarding',
    'init:get-status',
    // Database - Projects
    'db:projects:create',
    'db:projects:getAll',
    'db:projects:getById',
    // Database - Resources
    'db:resources:create',
    'db:resources:getByProject',
    'db:resources:getById',
    'db:resources:update',
    'db:resources:search',
    'db:resources:getAll',
    'db:resources:delete',
    'db:resources:getByFolder',
    'db:resources:getRoot',
    'db:resources:moveToFolder',
    'db:resources:removeFromFolder',
    'db:resources:searchForMention',
    'db:resources:getBacklinks',
    'db:resources:uploadFile',
    // Database - Notes (Docmost-style)
    'db:notes:create',
    'db:notes:getById',
    'db:notes:getByIdOrSlug',
    'db:notes:update',
    'db:notes:remove',
    'db:notes:restore',
    'db:notes:getRoot',
    'db:notes:getByProject',
    'db:notes:getChildren',
    'db:notes:getDeleted',
    'db:notes:search',
    'db:notes:getBacklinks',
    'db:notes:getHistory',
    'db:notes:restoreFromHistory',
    'db:notes:move',
    'db:notes:getBreadcrumbs',
    'db:notes:duplicate',
    // Database - Interactions
    'db:interactions:create',
    'db:interactions:getByResource',
    'db:tags:getByResource',
    'db:tags:getAll',
    'db:tags:getResources',
    'db:interactions:getByType',
    'db:interactions:update',
    'db:interactions:delete',
    // Database - Chat (traceability)
    'db:chat:createSession',
    'db:chat:getSession',
    'db:chat:updateSession',
    'db:chat:getSessionsByAgent',
    'db:chat:getSessionsGlobal',
    'db:chat:addMessage',
    'db:chat:appendTrace',
    // Runs and automations
    'runs:get',
    'runs:list',
    'runs:getActiveBySession',
    'runs:startLangGraph',
    'runs:startWorkflow',
    'runs:resume',
    'runs:abort',
    'runs:delete',
    'automations:get',
    'automations:list',
    'automations:upsert',
    'automations:delete',
    'automations:runNow',
    // Database - Links
    'db:links:create',
    'db:links:getBySource',
    'db:links:getByTarget',
    'db:links:delete',
    // Database - Knowledge Graph
    'db:graph:createNode',
    'db:graph:getNode',
    'db:graph:getNodesByType',
    'db:graph:createEdge',
    'db:graph:getNeighbors',
    'db:graph:searchNodes',
    // Database - Search
    'db:search:unified',
    // Database - Settings
    'db:settings:get',
    'db:settings:set',
    'db:settings:saveAI',
    // Resource file storage
    'resource:import',
    'resource:importMultiple',
    'resource:getFilePath',
    'resource:readFile',
    'resource:readDocumentContent',
    'resource:extractPptImages',
    'resource:writeExcelContent',
    'resource:saveDocxFromHtml',
    'resource:export',
    'note:exportToPdf',
    'note:exportToDocx',
    'note:exportToMarkdown',
    'note:exportToHtml',
    'note:getTreeForExport',
    'note:saveExportZip',
    'note:createExportZip',
    'resource:delete',
    'resource:regenerateThumbnail',
    'resource:setThumbnail',
    'resource:scheduleIndex',
    // File operations
    'file:generateHash',
    'file:readFile',
    'file:readFileAsText',
    'file:writeFile',
    'file:deleteFile',
    'file:copyFile',
    'file:listDirectory',
    'file:getInfo',
    'file:imageToBase64',
    'file:cleanTemp',
    'file:extractPDFText',
    // Storage management
    'storage:getUsage',
    'storage:cleanup',
    'storage:getPath',
    // Migration
    'migration:migrateResources',
    'migration:getStatus',
    'migration:migrateNotesToDomain',
    'migration:getNotesMigrationStatus',
    // Web scraping
    'web:scrape',
    'web:get-youtube-thumbnail',
    'web:save-screenshot',
    // Image processing
    'image:crop',
    'image:resize',
    'image:thumbnail',
    'image:metadata',
    'web:process',
    // Ollama
    'ollama:check-availability',
    'ollama:list-models',
    'ollama:generate-embedding',
    'ollama:generate-summary',
    'ollama:chat',
    // Ollama Manager (Native Integration)
    'ollama:manager:start',
    'ollama:manager:stop',
    'ollama:manager:status',
    'ollama:manager:download',
    'ollama:manager:versions',
    // Vector Database channels removed (LanceDB replaced by PageIndex)
    // WhatsApp
    'whatsapp:status',
    'whatsapp:start',
    'whatsapp:stop',
    'whatsapp:logout',
    'whatsapp:send',
    'whatsapp:allowlist:get',
    'whatsapp:allowlist:add',
    'whatsapp:allowlist:remove',
    // Auth Manager
    'auth:profiles:list',
    'auth:profiles:create',
    'auth:profiles:delete',
    'auth:resolve',
    'auth:validate',
    // Dome provider OAuth
    'domeauth:startOAuthFlow',
    'domeauth:openDashboard',
    'domeauth:getSession',
    'domeauth:disconnect',
    'domeauth:getQuota',
    // Personality Loader
    'personality:get-prompt',
    'personality:read-file',
    'personality:write-file',
    'personality:add-memory',
    'personality:list-files',
    'personality:remember-fact',
    // AI Cloud (OpenAI, Anthropic, Google)
    'ai:chat',
    'ai:stream',
    'ai:langgraph:stream',
    'ai:langgraph:abort',
    'ai:langgraph:resume',
    'ai:embeddings',
    'ai:testConnection',
    'ai:testWebSearch',
    // Agent Team orchestration
    'ai:team:stream',
    'ai:team:abort',
    // AI Tools (for Many agent)
    'ai:tools:resourceSearch',
    'ai:tools:resourceGet',
    'ai:tools:resourceGetSection',
    'ai:tools:resourceList',
    'ai:tools:resourceSemanticSearch',
    'ai:tools:pdfExtractText',
    'ai:tools:pdfGetMetadata',
    'ai:tools:pdfGetStructure',
    'ai:tools:pdfSummarize',
    'ai:tools:pdfExtractTables',
    'ai:tools:projectList',
    'ai:tools:projectGet',
    'ai:tools:interactionList',
    'ai:tools:getRecentResources',
    'ai:tools:getCurrentProject',
    'ai:tools:getLibraryOverview',
    // AI Tools - Resource Actions (for Many agent)
    'ai:tools:resourceCreate',
    'ai:tools:resourceUpdate',
    'ai:tools:resourceDelete',
    'ai:tools:resourceMoveToFolder',
    'ai:tools:importFileToLibrary',
    // Resource import from content (for MCP agent tool)
    'resource:importFromContent',
    // AI Tools - Flashcards
    'ai:tools:flashcardCreate',
    // AI Tools - Document Structure
    'ai:tools:getDocumentStructure',
    // AI Tools - Graph / Linking
    'ai:tools:linkResources',
    'ai:tools:getRelatedResources',
    // AI Tools - Calendar
    'ai:tools:calendarListEvents',
    'ai:tools:calendarGetUpcoming',
    'ai:tools:calendarCreateEvent',
    'ai:tools:calendarUpdateEvent',
    'ai:tools:calendarDeleteEvent',
    // AI Tools - Excel
    'ai:tools:excelGet',
    'ai:tools:excelGetFilePath',
    'ai:tools:excelSetCell',
    'ai:tools:excelSetRange',
    'ai:tools:excelAddRow',
    'ai:tools:excelAddSheet',
    'ai:tools:excelCreate',
    'ai:tools:excelExport',
    // AI Tools - PPT
    'ai:tools:pptCreate',
    'ai:tools:pptGetFilePath',
    'ai:tools:pptGetSlides',
    'ai:tools:pptExport',
    'ai:tools:pptGetSlideImages',
    // Database - Flashcards
    'db:flashcards:createDeck',
    'db:flashcards:getDeck',
    'db:flashcards:getDecksByProject',
    'db:flashcards:getAllDecks',
    'db:flashcards:updateDeck',
    'db:flashcards:deleteDeck',
    'db:flashcards:createCard',
    'db:flashcards:createCards',
    'db:flashcards:getCards',
    'db:flashcards:getDueCards',
    'db:flashcards:reviewCard',
    'db:flashcards:updateCard',
    'db:flashcards:deleteCard',
    'db:flashcards:getStats',
    'db:flashcards:createSession',
    'db:flashcards:getSessions',
    // Audio (TTS)
    'audio:generate-speech',
    'audio:generate-podcast',
    'audio:get-status',
    'audio:list',
    // Database - Studio Outputs
    'db:studio:create',
    'db:studio:getByProject',
    'db:studio:getById',
    'db:studio:update',
    'db:studio:delete',
    'ollama:list-models',
    'ollama:generate-embedding',
    'ollama:generate-summary',
    'ollama:chat',
    // Vector channels removed (LanceDB replaced by PageIndex)
    // PageIndex - Reasoning-based RAG (replaces vector embeddings)
    'pageindex:start',
    'pageindex:status',
    'pageindex:resource-status',
    'pageindex:index',
    'pageindex:search',
    'pageindex:delete',
    'pageindex:reindex',
    'pageindex:index-missing',
    // Notebook (Python via IPC)
    'notebook:runPython',
    'notebook:checkPython',
    'notebook:createVenv',
    'notebook:pipInstall',
    'notebook:checkVenv',
    'notebook:pipList',
    'notebook:pipInstallFromRequirements',
    // Auto-updater
    'updater:check',
    'updater:download',
    'updater:install',
    // Sync export/import
    'sync:export',
    'sync:import',
    // MCP
    'mcp:testConnection',
    'mcp:testServer',
    'mcp:startOAuthFlow',
    'mcp:getOAuthProviders',
    // Calendar
    'calendar:connectGoogle',
    'calendar:getGoogleAccounts',
    'calendar:listCalendars',
    'calendar:listEvents',
    'calendar:createEvent',
    'calendar:updateEvent',
    'calendar:deleteEvent',
    'calendar:syncNow',
    'calendar:getUpcoming',
    // Plugins
    'plugin:list',
    'plugin:install-from-folder',
    'plugin:install-from-repo',
    'plugin:uninstall',
    'plugin:setEnabled',
    'plugin:read-asset',
    // Cloud Storage (Google Drive + OneDrive)
    'cloud:get-accounts',
    'cloud:auth-google',
    'cloud:auth-onedrive',
    'cloud:disconnect',
    'cloud:list-files',
    'cloud:import-file',
    // Marketplace
    'marketplace:fetch-all',
    'marketplace:fetch-agents',
    'marketplace:fetch-workflows',
    'marketplace:fetch-mcp',
    'marketplace:fetch-skills',
    'marketplace:fetch-plugins',
    'marketplace:get-config',
    'marketplace:update-config',
    'marketplace:refresh',
    'marketplace:rate-limit',
    'marketplace:install-plugin',
    'marketplace:install-skill',
    'marketplace:uninstall-skill',
    // Docling cloud conversion
    'docling:convert-resource',
    'docling:get-resource-images',
    'docling:get-image-data',
  ],
  // Canales para on/once (main → renderer)
  on: [
    'theme-changed',
    // Resource events
    'resource:created',
    'resource:updated',
    'resource:deleted',
    // Note events (Docmost-style)
    'note:created',
    'note:updated',
    'note:removed',
    'note:restored',
    // Interaction events
    'interaction:created',
    'interaction:updated',
    'interaction:deleted',
    // Project events
    'project:created',
    'project:updated',
    'project:deleted',
    // WhatsApp events
    'whatsapp:qr',
    'whatsapp:connected',
    'whatsapp:disconnected',
    // AI Cloud streaming
    'ai:stream:chunk',
    // PageIndex (native JS) — live indexing progress
    'pageindex:progress',
    // Audio events
    'audio:generation-progress',
    // Auto-updater events
    'updater:status',
    // Ollama Manager events
    'ollama:download-progress',
    'ollama:server-log',
    'ollama:status-changed',
    // Studio events
    'studio:outputCreated',
    // Deep link: open studio output from dome://studio/ID
    'dome:open-studio-output',
    // Flashcard events
    'flashcard:deckCreated',
    'flashcard:deckUpdated',
    'flashcard:deckDeleted',
    // PPT background generation events
    'ppt:created',
    'ppt:creation-failed',
    // Analytics (from main process)
    'analytics:event',
    // Settings (navigate to section when window already open)
    'settings:navigate-to-section',
    // Calendar events
    'calendar:eventCreated',
    'calendar:eventUpdated',
    'calendar:eventDeleted',
    'calendar:eventsUpdated',
    'calendar:syncStatus',
    'calendar:upcoming',
    // Persistent runs
    'runs:updated',
    'runs:step',
    'runs:chunk',
    // Cloud Storage OAuth result
    'cloud:auth-result',
    // Docling cloud conversion progress
    'docling:progress',
  ],
};

const electronHandler = {
  // ============================================
  // SYSTEM PATHS
  // ============================================
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getHomePath: () => ipcRenderer.invoke('get-home-path'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ============================================
  // FILE DIALOGS
  // ============================================
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  selectFiles: (options) => ipcRenderer.invoke('select-files', options),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // Get file path from a dropped File object (for drag-and-drop)
  getPathForFile: (file) => {
    try {
      // webUtils.getPathForFile() is the recommended way in Electron 24+
      return webUtils.getPathForFile(file);
    } catch (error) {
      console.error('Error getting path for file:', error);
      return null;
    }
  },

  // Get paths for multiple dropped files
  getPathsForFiles: (files) => {
    if (!files || !Array.isArray(files)) {
      return [];
    }
    return files.map((file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return null;
      }
    }).filter(Boolean);
  },

  // ============================================
  // FILE SYSTEM OPERATIONS
  // ============================================
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  showItemInFolder: (filePath) =>
    ipcRenderer.invoke('show-item-in-folder', filePath),

  // ============================================
  // THEME
  // ============================================
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  onThemeChanged: (callback) => {
    const subscription = (event, data) => callback(data.theme);
    ipcRenderer.on('theme-changed', subscription);

    return () => {
      ipcRenderer.removeListener('theme-changed', subscription);
    };
  },

  // ============================================
  // SYSTEM / AUTO-LAUNCH
  // ============================================
  getLoginItemSettings: () => ipcRenderer.invoke('system:get-login-item'),
  setLoginItemSettings: (openAtLogin) => ipcRenderer.invoke('system:set-login-item', openAtLogin),
  quitApp: () => ipcRenderer.invoke('system:quit'),

  // ============================================
  // USER SETTINGS
  // ============================================
  openSettings: (options) => ipcRenderer.invoke('window:open-settings', options),

  // ============================================
  // IPC COMMUNICATION
  // ============================================
  invoke: (channel, ...args) => {
    // Validate channel is in whitelist
    if (!ALLOWED_CHANNELS.invoke.includes(channel)) {
      console.error(`[Preload] Channel not allowed for invoke: ${channel}`);
      throw new Error(`Channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel, callback) => {
    // Validate channel is in whitelist
    if (!ALLOWED_CHANNELS.on.includes(channel)) {
      console.error(`[Preload] Channel not allowed for listening: ${channel}`);
      throw new Error(`Channel not allowed: ${channel}`);
    }

    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  once: (channel, callback) => {
    // Validate channel is in whitelist
    if (!ALLOWED_CHANNELS.on.includes(channel)) {
      console.error(`[Preload] Channel not allowed for once: ${channel}`);
      throw new Error(`Channel not allowed: ${channel}`);
    }
    ipcRenderer.once(channel, (event, ...args) => callback(...args));
  },

  // send() is deprecated - use invoke() for request-response pattern
  // This method is kept for backward compatibility but should not be used
  // It does not validate channels as it's meant to be removed
  send: (channel, ...args) => {
    console.warn(`[Preload] send() is deprecated. Use invoke() instead. Channel: ${channel}`);
    // Note: We don't validate channels here as send() should be removed
    // If you need to use send(), add the channel to a whitelist first
    ipcRenderer.send(channel, ...args);
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // ============================================
  // PLATFORM INFO
  // ============================================
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
  platform: process.platform,

  // ============================================
  // ENVIRONMENT
  // ============================================
  isDev: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  nodeVersion: process.versions.node,
  chromeVersion: process.versions.chrome,
  electronVersion: process.versions.electron,

  // ============================================
  // INITIALIZATION API
  // ============================================
  init: {
    initialize: () => ipcRenderer.invoke('init:initialize'),
    checkOnboarding: () => ipcRenderer.invoke('init:check-onboarding'),
    getStatus: () => ipcRenderer.invoke('init:get-status'),
  },

  // ============================================
  // AUTO-UPDATER API
  // ============================================
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('updater:status', subscription);
      return () => ipcRenderer.removeListener('updater:status', subscription);
    },
  },

  // ============================================
  // SYNC (Export/Import) API
  // ============================================
  sync: {
    export: () => ipcRenderer.invoke('sync:export'),
    import: () => ipcRenderer.invoke('sync:import'),
  },

  // ============================================
  // CALENDAR API
  // ============================================
  calendar: {
    connectGoogle: () => ipcRenderer.invoke('calendar:connectGoogle'),
    getGoogleAccounts: () => ipcRenderer.invoke('calendar:getGoogleAccounts'),
    listCalendars: (accountId) => ipcRenderer.invoke('calendar:listCalendars', accountId),
    listEvents: (params) => ipcRenderer.invoke('calendar:listEvents', params),
    createEvent: (data) => ipcRenderer.invoke('calendar:createEvent', data),
    updateEvent: (eventId, updates) => ipcRenderer.invoke('calendar:updateEvent', eventId, updates),
    deleteEvent: (eventId) => ipcRenderer.invoke('calendar:deleteEvent', eventId),
    syncNow: () => ipcRenderer.invoke('calendar:syncNow'),
    getUpcoming: (params) => ipcRenderer.invoke('calendar:getUpcoming', params),
    onUpcoming: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('calendar:upcoming', subscription);
      return () => ipcRenderer.removeListener('calendar:upcoming', subscription);
    },
    onEventCreated: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('calendar:eventCreated', subscription);
      return () => ipcRenderer.removeListener('calendar:eventCreated', subscription);
    },
    onEventUpdated: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('calendar:eventUpdated', subscription);
      return () => ipcRenderer.removeListener('calendar:eventUpdated', subscription);
    },
    onEventDeleted: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('calendar:eventDeleted', subscription);
      return () => ipcRenderer.removeListener('calendar:eventDeleted', subscription);
    },
    onSyncStatus: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('calendar:syncStatus', subscription);
      return () => ipcRenderer.removeListener('calendar:syncStatus', subscription);
    },
  },

  // ============================================
  // MCP API
  // ============================================
  mcp: {
    testConnection: () => ipcRenderer.invoke('mcp:testConnection'),
    testServer: (server) => ipcRenderer.invoke('mcp:testServer', server),
    startOAuthFlow: (providerId) => ipcRenderer.invoke('mcp:startOAuthFlow', providerId),
    getOAuthProviders: () => ipcRenderer.invoke('mcp:getOAuthProviders'),
  },

  // ============================================
  // DOME PROVIDER OAUTH API
  // ============================================
  domeAuth: {
    startOAuthFlow: () => ipcRenderer.invoke('domeauth:startOAuthFlow'),
    openDashboard: () => ipcRenderer.invoke('domeauth:openDashboard'),
    getSession: () => ipcRenderer.invoke('domeauth:getSession'),
    disconnect: () => ipcRenderer.invoke('domeauth:disconnect'),
    getQuota: () => ipcRenderer.invoke('domeauth:getQuota'),
  },

  // ============================================
  // PLUGINS API
  // ============================================
  plugins: {
    list: () => ipcRenderer.invoke('plugin:list'),
    installFromFolder: () => ipcRenderer.invoke('plugin:install-from-folder'),
    installFromRepo: (repo) => ipcRenderer.invoke('plugin:install-from-repo', repo),
    uninstall: (pluginId) => ipcRenderer.invoke('plugin:uninstall', pluginId),
    setEnabled: (pluginId, enabled) => ipcRenderer.invoke('plugin:setEnabled', pluginId, enabled),
    readAsset: (pluginId, relativePath) => ipcRenderer.invoke('plugin:read-asset', pluginId, relativePath),
  },

  // ============================================
  // MARKETPLACE API
  // ============================================
  marketplace: {
    fetchAll: () => ipcRenderer.invoke('marketplace:fetch-all'),
    fetchAgents: () => ipcRenderer.invoke('marketplace:fetch-agents'),
    fetchWorkflows: () => ipcRenderer.invoke('marketplace:fetch-workflows'),
    fetchMcp: () => ipcRenderer.invoke('marketplace:fetch-mcp'),
    fetchSkills: () => ipcRenderer.invoke('marketplace:fetch-skills'),
    fetchPlugins: () => ipcRenderer.invoke('marketplace:fetch-plugins'),
    getConfig: () => ipcRenderer.invoke('marketplace:get-config'),
    updateConfig: (config) => ipcRenderer.invoke('marketplace:update-config', config),
    refresh: () => ipcRenderer.invoke('marketplace:refresh'),
    getRateLimit: () => ipcRenderer.invoke('marketplace:rate-limit'),
    installPlugin: () => ipcRenderer.invoke('marketplace:install-plugin'),
    installSkill: () => ipcRenderer.invoke('marketplace:install-skill'),
    uninstallSkill: (skillId) => ipcRenderer.invoke('marketplace:uninstall-skill', skillId),
  },

  // ============================================
  // DATABASE API
  // ============================================
  db: {
    // Projects
    projects: {
      create: (project) => ipcRenderer.invoke('db:projects:create', project),
      getAll: () => ipcRenderer.invoke('db:projects:getAll'),
      getById: (id) => ipcRenderer.invoke('db:projects:getById', id),
    },

    // Resources
    resources: {
      create: (resource) => ipcRenderer.invoke('db:resources:create', resource),
      getByProject: (projectId) => ipcRenderer.invoke('db:resources:getByProject', projectId),
      getById: (id) => ipcRenderer.invoke('db:resources:getById', id),
      update: (resource) => ipcRenderer.invoke('db:resources:update', resource),
      search: (query) => ipcRenderer.invoke('db:resources:search', query),
      getAll: (limit) => ipcRenderer.invoke('db:resources:getAll', limit),
      delete: (id) => ipcRenderer.invoke('db:resources:delete', id),
      // Folder containment
      getByFolder: (folderId) => ipcRenderer.invoke('db:resources:getByFolder', folderId),
      getRoot: (projectId) => ipcRenderer.invoke('db:resources:getRoot', projectId),
      moveToFolder: (resourceId, folderId) =>
        ipcRenderer.invoke('db:resources:moveToFolder', { resourceId, folderId }),
      removeFromFolder: (resourceId) =>
        ipcRenderer.invoke('db:resources:removeFromFolder', resourceId),
      searchForMention: (query) =>
        ipcRenderer.invoke('db:resources:searchForMention', query),
      getBacklinks: (id) =>
        ipcRenderer.invoke('db:resources:getBacklinks', id),
      uploadFile: (filePath, projectId, type, title) =>
        ipcRenderer.invoke('db:resources:uploadFile', { filePath, projectId, type, title }),
    },

    // Notes (Docmost-style domain)
    notes: {
      create: (note) => ipcRenderer.invoke('db:notes:create', note),
      getById: (id) => ipcRenderer.invoke('db:notes:getById', id),
      getByIdOrSlug: (idOrSlug) => ipcRenderer.invoke('db:notes:getByIdOrSlug', idOrSlug),
      update: (note) => ipcRenderer.invoke('db:notes:update', note),
      remove: (noteId) => ipcRenderer.invoke('db:notes:remove', noteId),
      restore: (noteId) => ipcRenderer.invoke('db:notes:restore', noteId),
      getRoot: (projectId) => ipcRenderer.invoke('db:notes:getRoot', projectId),
      getByProject: (projectId) => ipcRenderer.invoke('db:notes:getByProject', projectId),
      getChildren: (parentNoteId) => ipcRenderer.invoke('db:notes:getChildren', parentNoteId),
      getDeleted: (projectId) => ipcRenderer.invoke('db:notes:getDeleted', projectId),
      search: (query, projectId) => ipcRenderer.invoke('db:notes:search', { query, projectId }),
      getBacklinks: (noteId) => ipcRenderer.invoke('db:notes:getBacklinks', noteId),
      getHistory: (noteId, limit) => ipcRenderer.invoke('db:notes:getHistory', noteId, limit),
      restoreFromHistory: (historyId) => ipcRenderer.invoke('db:notes:restoreFromHistory', historyId),
      move: (noteId, parentNoteId, index) =>
        ipcRenderer.invoke('db:notes:move', { noteId, parentNoteId, index }),
      getBreadcrumbs: (noteId) => ipcRenderer.invoke('db:notes:getBreadcrumbs', noteId),
      duplicate: (noteId, projectId, parentNoteId) =>
        ipcRenderer.invoke('db:notes:duplicate', { noteId, projectId, parentNoteId }),
    },

    // Resource Interactions (notes, annotations, chat)
    interactions: {
      create: (interaction) => ipcRenderer.invoke('db:interactions:create', interaction),
      getByResource: (resourceId) => ipcRenderer.invoke('db:interactions:getByResource', resourceId),
      getByType: (resourceId, type) => ipcRenderer.invoke('db:interactions:getByType', { resourceId, type }),
      update: (interaction) => ipcRenderer.invoke('db:interactions:update', interaction),
      delete: (id) => ipcRenderer.invoke('db:interactions:delete', id),
    },

    // Chat sessions and messages (traceability)
    chat: {
      createSession: (opts) => ipcRenderer.invoke('db:chat:createSession', opts),
      getSession: (sessionId) => ipcRenderer.invoke('db:chat:getSession', sessionId),
      updateSession: (opts) => ipcRenderer.invoke('db:chat:updateSession', opts),
      getSessionsByAgent: (opts) => ipcRenderer.invoke('db:chat:getSessionsByAgent', opts),
      getSessionsGlobal: (limit) => ipcRenderer.invoke('db:chat:getSessionsGlobal', limit),
      addMessage: (opts) => ipcRenderer.invoke('db:chat:addMessage', opts),
      appendTrace: (opts) => ipcRenderer.invoke('db:chat:appendTrace', opts),
    },

    // Tags
    tags: {
      getByResource: (resourceId) => ipcRenderer.invoke('db:tags:getByResource', resourceId),
      getAll: () => ipcRenderer.invoke('db:tags:getAll'),
      getResources: (tagId) => ipcRenderer.invoke('db:tags:getResources', tagId),
    },

    // Resource Links (graph relationships)
    links: {
      create: (link) => ipcRenderer.invoke('db:links:create', link),
      getBySource: (sourceId) => ipcRenderer.invoke('db:links:getBySource', sourceId),
      getByTarget: (targetId) => ipcRenderer.invoke('db:links:getByTarget', targetId),
      delete: (id) => ipcRenderer.invoke('db:links:delete', id),
    },

    // Knowledge Graph
    graph: {
      createNode: (node) => ipcRenderer.invoke('db:graph:createNode', node),
      getNode: (nodeId) => ipcRenderer.invoke('db:graph:getNode', nodeId),
      getNodesByType: (type) => ipcRenderer.invoke('db:graph:getNodesByType', type),
      createEdge: (edge) => ipcRenderer.invoke('db:graph:createEdge', edge),
      getNeighbors: (nodeId) => ipcRenderer.invoke('db:graph:getNeighbors', nodeId),
      searchNodes: (query) => ipcRenderer.invoke('db:graph:searchNodes', query),
    },

    // Unified Search
    search: {
      unified: (query) => ipcRenderer.invoke('db:search:unified', query),
    },

    // Flashcards
    flashcards: {
      createDeck: (deck) => ipcRenderer.invoke('db:flashcards:createDeck', deck),
      getDeck: (id) => ipcRenderer.invoke('db:flashcards:getDeck', id),
      getDecksByProject: (projectId) => ipcRenderer.invoke('db:flashcards:getDecksByProject', projectId),
      getAllDecks: (limit) => ipcRenderer.invoke('db:flashcards:getAllDecks', limit),
      updateDeck: (deck) => ipcRenderer.invoke('db:flashcards:updateDeck', deck),
      deleteDeck: (id) => ipcRenderer.invoke('db:flashcards:deleteDeck', id),
      createCard: (card) => ipcRenderer.invoke('db:flashcards:createCard', card),
      createCards: (deckId, cards) => ipcRenderer.invoke('db:flashcards:createCards', { deckId, cards }),
      getCards: (deckId) => ipcRenderer.invoke('db:flashcards:getCards', deckId),
      getDueCards: (deckId, limit) => ipcRenderer.invoke('db:flashcards:getDueCards', { deckId, limit }),
      reviewCard: (cardId, quality) => ipcRenderer.invoke('db:flashcards:reviewCard', { cardId, quality }),
      updateCard: (card) => ipcRenderer.invoke('db:flashcards:updateCard', card),
      deleteCard: (id) => ipcRenderer.invoke('db:flashcards:deleteCard', id),
      getStats: (deckId) => ipcRenderer.invoke('db:flashcards:getStats', deckId),
      createSession: (session) => ipcRenderer.invoke('db:flashcards:createSession', session),
      getSessions: (deckId, limit) => ipcRenderer.invoke('db:flashcards:getSessions', { deckId, limit }),
    },

    // Studio outputs
    studio: {
      create: (data) => ipcRenderer.invoke('db:studio:create', data),
      getByProject: (projectId) => ipcRenderer.invoke('db:studio:getByProject', projectId),
      getById: (id) => ipcRenderer.invoke('db:studio:getById', id),
      update: (id, updates) => ipcRenderer.invoke('db:studio:update', id, updates),
      delete: (id) => ipcRenderer.invoke('db:studio:delete', id),
    },

    // Settings
    settings: {
      get: (key) => ipcRenderer.invoke('db:settings:get', key),
      set: (key, value) => {
        // Debug: log email details to diagnose truncation issue
        if (key === 'user_email') {
          console.log(`[Preload] Setting user_email:`);
          console.log(`[Preload]   - Value: "${value}"`);
          console.log(`[Preload]   - Length: ${value?.length}`);
        }
        return ipcRenderer.invoke('db:settings:set', key, value);
      },
      saveAI: (config) => ipcRenderer.invoke('db:settings:saveAI', config),
    },
  },

  // ============================================
  // RUNS AND AUTOMATIONS API
  // ============================================
  runs: {
    get: (runId) => ipcRenderer.invoke('runs:get', runId),
    list: (filters) => ipcRenderer.invoke('runs:list', filters),
    getActiveBySession: (sessionId) => ipcRenderer.invoke('runs:getActiveBySession', sessionId),
    startLangGraph: (params) => ipcRenderer.invoke('runs:startLangGraph', params),
    startWorkflow: (params) => ipcRenderer.invoke('runs:startWorkflow', params),
    resume: (runId, decisions) => ipcRenderer.invoke('runs:resume', { runId, decisions }),
    abort: (runId) => ipcRenderer.invoke('runs:abort', runId),
    delete: (runId) => ipcRenderer.invoke('runs:delete', runId),
    onUpdated: (callback) => {
      const subscription = (_event, data) => callback(data);
      ipcRenderer.on('runs:updated', subscription);
      return () => ipcRenderer.removeListener('runs:updated', subscription);
    },
    onStep: (callback) => {
      const subscription = (_event, data) => callback(data);
      ipcRenderer.on('runs:step', subscription);
      return () => ipcRenderer.removeListener('runs:step', subscription);
    },
    onChunk: (callback) => {
      const subscription = (_event, data) => callback(data);
      ipcRenderer.on('runs:chunk', subscription);
      return () => ipcRenderer.removeListener('runs:chunk', subscription);
    },
  },

  automations: {
    get: (automationId) => ipcRenderer.invoke('automations:get', automationId),
    list: (filters) => ipcRenderer.invoke('automations:list', filters),
    upsert: (automation) => ipcRenderer.invoke('automations:upsert', automation),
    delete: (automationId) => ipcRenderer.invoke('automations:delete', automationId),
    runNow: (automationId) => ipcRenderer.invoke('automations:runNow', automationId),
  },

  // ============================================
  // CLOUD STORAGE API (Google Drive + OneDrive)
  // ============================================
  cloud: {
    getAccounts: () => ipcRenderer.invoke('cloud:get-accounts'),
    authGoogle: () => ipcRenderer.invoke('cloud:auth-google'),
    authOneDrive: () => ipcRenderer.invoke('cloud:auth-onedrive'),
    disconnect: (accountId) => ipcRenderer.invoke('cloud:disconnect', { accountId }),
    listFiles: (params) => ipcRenderer.invoke('cloud:list-files', params),
    importFile: (params) => ipcRenderer.invoke('cloud:import-file', params),
    onAuthResult: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('cloud:auth-result', subscription);
      return () => ipcRenderer.removeListener('cloud:auth-result', subscription);
    },
  },

  // ============================================
  // DOCLING CLOUD CONVERSION API
  // ============================================
  docling: {
    // Convert a resource file via Docling cloud service (requires Dome Pro)
    convertResource: (resourceId) =>
      ipcRenderer.invoke('docling:convert-resource', { resourceId }),

    // Get all stored images extracted from a resource's Docling conversion
    getResourceImages: (resourceId) =>
      ipcRenderer.invoke('docling:get-resource-images', { resourceId }),

    // Get base64 image data for a specific stored image
    getImageData: (imageId) =>
      ipcRenderer.invoke('docling:get-image-data', { imageId }),

    // Listen for conversion progress events
    onProgress: (callback) => {
      const subscription = (_event, data) => callback(data);
      ipcRenderer.on('docling:progress', subscription);
      return () => ipcRenderer.removeListener('docling:progress', subscription);
    },
  },

  // ============================================
  // WORKSPACE API
  // ============================================
  workspace: {
    // Open a workspace window for a resource (options: { page?: number } for PDF)
    open: (resourceId, resourceType, options) =>
      ipcRenderer.invoke('window:open-workspace', { resourceId, resourceType, ...options }),
    // Open Home window with folder selected
    openFolder: (folderId) =>
      ipcRenderer.invoke('window:open-folder', { folderId }),
  },

  // ============================================
  // RESOURCE FILE STORAGE API
  // ============================================
  resource: {
    // Import a file to internal storage
    import: (filePath, projectId, type, title) =>
      ipcRenderer.invoke('resource:import', { filePath, projectId, type, title }),

    // Import multiple files at once
    importMultiple: (filePaths, projectId, type) =>
      ipcRenderer.invoke('resource:importMultiple', { filePaths, projectId, type }),

    // Get full path to open file in native app
    getFilePath: (resourceId) =>
      ipcRenderer.invoke('resource:getFilePath', resourceId),

    // Read file content as Base64 data URL
    readFile: (resourceId) =>
      ipcRenderer.invoke('resource:readFile', resourceId),

    // Read document content as raw Base64 for renderer-side parsing (DOCX, XLSX, CSV)
    readDocumentContent: (resourceId) =>
      ipcRenderer.invoke('resource:readDocumentContent', resourceId),

    // Extract one image per slide from PPTX (LibreOffice + pdf2image)
    extractPptImages: (resourceId) =>
      ipcRenderer.invoke('resource:extractPptImages', resourceId),

    writeExcelContent: (resourceId, data) =>
      ipcRenderer.invoke('resource:writeExcelContent', { resourceId, data }),

    // Save DOCX from HTML (for editable document workspace)
    saveDocxFromHtml: (resourceId, html) =>
      ipcRenderer.invoke('resource:saveDocxFromHtml', { resourceId, html }),

    // Export resource to user-selected location
    export: (resourceId, destinationPath) =>
      ipcRenderer.invoke('resource:export', { resourceId, destinationPath }),

    // Delete resource and its internal file
    delete: (resourceId) =>
      ipcRenderer.invoke('resource:delete', resourceId),

    // Regenerate thumbnail for a resource
    regenerateThumbnail: (resourceId) =>
      ipcRenderer.invoke('resource:regenerateThumbnail', resourceId),

    // Set thumbnail from renderer (PDF first page, etc.)
    setThumbnail: (resourceId, thumbnailDataUrl) =>
      ipcRenderer.invoke('resource:setThumbnail', resourceId, thumbnailDataUrl),

    // Schedule indexing for resource (used when workspace opens - e.g. URL articles with scraped_content)
    scheduleIndex: (resourceId) =>
      ipcRenderer.invoke('resource:scheduleIndex', resourceId),

    // Import file content directly (used by AI agents that read files via MCP servers)
    importFromContent: (args) =>
      ipcRenderer.invoke('resource:importFromContent', args),
  },

  // ============================================
  // NOTE EXPORT API
  // ============================================
  note: {
    exportToPdf: (params) => ipcRenderer.invoke('note:exportToPdf', params),
    exportToDocx: (params) => ipcRenderer.invoke('note:exportToDocx', params),
    exportToMarkdown: (params) => ipcRenderer.invoke('note:exportToMarkdown', params),
    exportToHtml: (params) => ipcRenderer.invoke('note:exportToHtml', params),
    getTreeForExport: (params) => ipcRenderer.invoke('note:getTreeForExport', params),
    saveExportZip: (params) => ipcRenderer.invoke('note:saveExportZip', params),
    createExportZip: (params) => ipcRenderer.invoke('note:createExportZip', params),
  },

  // ============================================
  // STORAGE MANAGEMENT API
  // ============================================
  storage: {
    // Get storage usage statistics
    getUsage: () => ipcRenderer.invoke('storage:getUsage'),

    // Clean up orphaned files
    cleanup: () => ipcRenderer.invoke('storage:cleanup'),

    // Get storage directory path
    getPath: () => ipcRenderer.invoke('storage:getPath'),
  },

  // ============================================
  // FILE OPERATIONS API
  // ============================================
  file: {
    // Generate hash for a file
    generateHash: (filePath) => ipcRenderer.invoke('file:generateHash', filePath),

    // Read file contents
    readFile: (filePath) => ipcRenderer.invoke('file:readFile', filePath),
    readFileAsText: (filePath) => ipcRenderer.invoke('file:readFileAsText', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('file:writeFile', filePath, content),

    // Delete a file
    deleteFile: (filePath) => ipcRenderer.invoke('file:deleteFile', filePath),

    // Copy file
    copyFile: (sourcePath, destPath) => ipcRenderer.invoke('file:copyFile', sourcePath, destPath),

    // List directory contents (workspace, etc.)
    listDirectory: (dirPath) => ipcRenderer.invoke('file:listDirectory', dirPath),

    // Get file information
    getInfo: (filePath) => ipcRenderer.invoke('file:getInfo', filePath),

    // Convert image to base64
    imageToBase64: (filePath) => ipcRenderer.invoke('file:imageToBase64', filePath),

    // Clean temporary files
    cleanTemp: () => ipcRenderer.invoke('file:cleanTemp'),

    // Extract text from PDF
    extractPDFText: (filePath) => ipcRenderer.invoke('file:extractPDFText', filePath),
  },

  // ============================================
  // MIGRATION API
  // ============================================
  migration: {
    // Migrate legacy resources to internal storage
    migrateResources: () => ipcRenderer.invoke('migration:migrateResources'),

    // Get migration status (legacy file paths)
    getStatus: () => ipcRenderer.invoke('migration:getStatus'),

    // Migrate legacy notes (resources type=note) to notes domain
    migrateNotesToDomain: () => ipcRenderer.invoke('migration:migrateNotesToDomain'),

    // Get notes migration status
    getNotesMigrationStatus: () => ipcRenderer.invoke('migration:getNotesMigrationStatus'),
  },

  // ============================================
  // WEB SCRAPING API
  // ============================================
  web: {
    // Scrape a URL and extract content + screenshot
    scrape: (url) => ipcRenderer.invoke('web:scrape', url),

    // Get YouTube thumbnail
    getYouTubeThumbnail: (url) => ipcRenderer.invoke('web:get-youtube-thumbnail', url),

    // Save screenshot to internal storage
    saveScreenshot: (resourceId, screenshotBase64, internalPath) =>
      ipcRenderer.invoke('web:save-screenshot', { resourceId, screenshotBase64, internalPath }),

    // Process URL resource completely
    process: (resourceId) => ipcRenderer.invoke('web:process', resourceId),
  },

  // ============================================
  // IMAGE PROCESSING
  // ============================================
  image: {
    // Crop an image
    crop: (options) => ipcRenderer.invoke('image:crop', options),

    // Resize an image
    resize: (options) => ipcRenderer.invoke('image:resize', options),

    // Generate thumbnail
    thumbnail: (options) => ipcRenderer.invoke('image:thumbnail', options),

    // Get image metadata
    metadata: (filePath) => ipcRenderer.invoke('image:metadata', filePath),
  },

  // ============================================
  // AI CLOUD API (OpenAI, Anthropic, Google)
  // ============================================
  ai: {
    // Chat with cloud provider (non-streaming)
    chat: (provider, messages, model) => 
      ipcRenderer.invoke('ai:chat', { provider, messages, model }),

    // Stream chat with cloud provider (tools passed for provider-level tool support)
    stream: (provider, messages, model, streamId, tools) =>
      ipcRenderer.invoke('ai:stream', { provider, messages, model, streamId, tools }),

    // Stream chat using LangGraph agent (tools executed in main process)
    streamLangGraph: (provider, messages, model, streamId, tools, threadId, skipHitl, mcpServerIds, subagentIds) =>
      ipcRenderer.invoke('ai:langgraph:stream', { provider, messages, model, streamId, tools, threadId, skipHitl, mcpServerIds, subagentIds }),

    // Abort LangGraph stream (for Stop button in chat)
    abortLangGraph: (streamId) => ipcRenderer.invoke('ai:langgraph:abort', streamId),

    // Resume LangGraph after HITL interrupt
    resumeLangGraph: (opts) => ipcRenderer.invoke('ai:langgraph:resume', opts),

    // Listen for stream chunks
    onStreamChunk: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('ai:stream:chunk', subscription);
      return () => ipcRenderer.removeListener('ai:stream:chunk', subscription);
    },

    // Generate embeddings
    embeddings: (provider, texts, model) =>
      ipcRenderer.invoke('ai:embeddings', { provider, texts, model }),

    // Test AI connection (minimal API call to verify config)
    testConnection: () =>
      ipcRenderer.invoke('ai:testConnection'),

    testWebSearch: () =>
      ipcRenderer.invoke('ai:testWebSearch'),

    // AI Tools for Many agent
    tools: {
      // Search resources using full-text search
      resourceSearch: (query, options) =>
        ipcRenderer.invoke('ai:tools:resourceSearch', { query, options }),

      // Get resource by ID with full content
      resourceGet: (resourceId, options) =>
        ipcRenderer.invoke('ai:tools:resourceGet', { resourceId, options }),

      // Get a specific section of an indexed PDF/note by node_id
      resourceGetSection: (resourceId, nodeId) =>
        ipcRenderer.invoke('ai:tools:resourceGetSection', { resourceId, nodeId }),

      // List resources with optional filters
      resourceList: (options) =>
        ipcRenderer.invoke('ai:tools:resourceList', { options }),

      // Semantic search using embeddings
      resourceSemanticSearch: (query, options) =>
        ipcRenderer.invoke('ai:tools:resourceSemanticSearch', { query, options }),

      // PDF extraction tools
      pdfExtractText: (resourceId, options) =>
        ipcRenderer.invoke('ai:tools:pdfExtractText', { resourceId, options }),
      pdfGetMetadata: (resourceId) =>
        ipcRenderer.invoke('ai:tools:pdfGetMetadata', { resourceId }),
      pdfGetStructure: (resourceId) =>
        ipcRenderer.invoke('ai:tools:pdfGetStructure', { resourceId }),
      pdfSummarize: (resourceId, options) =>
        ipcRenderer.invoke('ai:tools:pdfSummarize', { resourceId, options }),
      pdfExtractTables: (resourceId) =>
        ipcRenderer.invoke('ai:tools:pdfExtractTables', { resourceId }),

      // List all projects
      projectList: () =>
        ipcRenderer.invoke('ai:tools:projectList'),

      // Get project by ID
      projectGet: (projectId) =>
        ipcRenderer.invoke('ai:tools:projectGet', { projectId }),

      // List interactions for a resource
      interactionList: (resourceId, options) =>
        ipcRenderer.invoke('ai:tools:interactionList', { resourceId, options }),

      // Get recent resources for context
      getRecentResources: (limit) =>
        ipcRenderer.invoke('ai:tools:getRecentResources', { limit }),

      // Get current/default project
      getCurrentProject: () =>
        ipcRenderer.invoke('ai:tools:getCurrentProject'),

      getLibraryOverview: (options) =>
        ipcRenderer.invoke('ai:tools:getLibraryOverview', { options }),

      // Resource Actions (Create, Update, Delete)
      resourceCreate: (data) =>
        ipcRenderer.invoke('ai:tools:resourceCreate', { data }),

      resourceUpdate: (resourceId, updates) =>
        ipcRenderer.invoke('ai:tools:resourceUpdate', { resourceId, updates }),

      resourceDelete: (resourceId) =>
        ipcRenderer.invoke('ai:tools:resourceDelete', { resourceId }),

      resourceMoveToFolder: (resourceId, folderId) =>
        ipcRenderer.invoke('ai:tools:resourceMoveToFolder', { resourceId, folderId }),

      // Import file content (for agents using MCP file servers)
      importFileToLibrary: (args) =>
        ipcRenderer.invoke('ai:tools:importFileToLibrary', args),

      // Flashcard creation (for AI-generated study decks)
      flashcardCreate: (data) =>
        ipcRenderer.invoke('ai:tools:flashcardCreate', { data }),

      // Excel tools
      excelGet: (resourceId, options) =>
        ipcRenderer.invoke('ai:tools:excelGet', { resourceId, options }),
      excelGetFilePath: (resourceId) =>
        ipcRenderer.invoke('ai:tools:excelGetFilePath', { resourceId }),
      excelSetCell: (resourceId, sheetName, cell, value) =>
        ipcRenderer.invoke('ai:tools:excelSetCell', { resourceId, sheetName, cell, value }),
      excelSetRange: (resourceId, sheetName, range, values) =>
        ipcRenderer.invoke('ai:tools:excelSetRange', { resourceId, sheetName, range, values }),
      excelAddRow: (resourceId, sheetName, values, afterRow) =>
        ipcRenderer.invoke('ai:tools:excelAddRow', { resourceId, sheetName, values, afterRow }),
      excelAddSheet: (resourceId, sheetName, data) =>
        ipcRenderer.invoke('ai:tools:excelAddSheet', { resourceId, sheetName, data }),
      excelCreate: (projectId, title, options) =>
        ipcRenderer.invoke('ai:tools:excelCreate', { projectId, title, options }),
      excelExport: (resourceId, options) =>
        ipcRenderer.invoke('ai:tools:excelExport', { resourceId, options }),
      // PPT tools
      pptCreate: (projectId, title, spec, options) =>
        ipcRenderer.invoke('ai:tools:pptCreate', { projectId, title, spec, script: options?.script, options }),
      pptGetFilePath: (resourceId) =>
        ipcRenderer.invoke('ai:tools:pptGetFilePath', { resourceId }),
      pptGetSlides: (resourceId) =>
        ipcRenderer.invoke('ai:tools:pptGetSlides', { resourceId }),
      pptExport: (resourceId, options) =>
        ipcRenderer.invoke('ai:tools:pptExport', { resourceId, options }),
      pptGetSlideImages: (resourceId) =>
        ipcRenderer.invoke('ai:tools:pptGetSlideImages', { resourceId }),
    },
  },

  // ============================================
  // AUDIO API (TTS)
  // ============================================
  audio: {
    // Generate speech from single text
    generateSpeech: (text, voice, options) =>
      ipcRenderer.invoke('audio:generate-speech', { text, voice, options }),

    // Generate full podcast from dialogue lines
    generatePodcast: (lines, options) =>
      ipcRenderer.invoke('audio:generate-podcast', { lines, options }),

    // Get generation status
    getStatus: (generationId) =>
      ipcRenderer.invoke('audio:get-status', { generationId }),

    // List generated audio files
    list: () => ipcRenderer.invoke('audio:list'),

    // Listen to generation progress
    onGenerationProgress: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('audio:generation-progress', subscription);
      return () => ipcRenderer.removeListener('audio:generation-progress', subscription);
    },
  },

  // ============================================
  // OLLAMA API
  // ============================================
  ollama: {
    // Check if Ollama is available
    checkAvailability: () => ipcRenderer.invoke('ollama:check-availability'),

    // List available models
    listModels: () => ipcRenderer.invoke('ollama:list-models'),

    // Generate embedding
    generateEmbedding: (text) => ipcRenderer.invoke('ollama:generate-embedding', text),

    // Generate summary
    generateSummary: (text) => ipcRenderer.invoke('ollama:generate-summary', text),

    // Chat
    chat: (messages, model) => ipcRenderer.invoke('ollama:chat', { messages, model }),

    // Native Ollama Manager (binary management and lifecycle)
    manager: {
      // Start Ollama server (downloads if needed)
      start: (version) => ipcRenderer.invoke('ollama:manager:start', version),

      // Stop Ollama server
      stop: () => ipcRenderer.invoke('ollama:manager:stop'),

      // Get status
      status: () => ipcRenderer.invoke('ollama:manager:status'),

      // Download version without starting
      download: (version) => ipcRenderer.invoke('ollama:manager:download', version),

      // Get list of downloaded versions
      versions: () => ipcRenderer.invoke('ollama:manager:versions'),

      // Listen to download progress
      onDownloadProgress: (callback) => {
        ipcRenderer.on('ollama:download-progress', (event, data) => callback(data));
        return () => ipcRenderer.removeAllListeners('ollama:download-progress');
      },

      // Listen to server logs
      onServerLog: (callback) => {
        ipcRenderer.on('ollama:server-log', (event, message) => callback(message));
        return () => ipcRenderer.removeAllListeners('ollama:server-log');
      },

      // Listen to status changes
      onStatusChanged: (callback) => {
        ipcRenderer.on('ollama:status-changed', (event, status) => callback(status));
        return () => ipcRenderer.removeAllListeners('ollama:status-changed');
      },
    },
  },

  // ============================================
  // NOTEBOOK API (Python via IPC)
  // ============================================
  notebook: {
    runPython: (code, options) =>
      ipcRenderer.invoke('notebook:runPython', {
        code,
        cells: options?.cells,
        targetCellIndex: options?.targetCellIndex,
        cwd: options?.cwd,
        venvPath: options?.venvPath,
        timeoutMs: options?.timeoutMs,
      }),
    checkPython: () => ipcRenderer.invoke('notebook:checkPython'),
    createVenv: (basePath) => ipcRenderer.invoke('notebook:createVenv', { basePath }),
    pipInstall: (venvPath, packages) => ipcRenderer.invoke('notebook:pipInstall', { venvPath, packages }),
    checkVenv: (venvPath) => ipcRenderer.invoke('notebook:checkVenv', { venvPath }),
    pipList: (venvPath) => ipcRenderer.invoke('notebook:pipList', { venvPath }),
    pipInstallFromRequirements: (venvPath, requirementsPath) =>
      ipcRenderer.invoke('notebook:pipInstallFromRequirements', { venvPath, requirementsPath }),
  },

  // ============================================
  // WHATSAPP API
  // ============================================
  whatsapp: {
    // Get connection status
    getStatus: () => ipcRenderer.invoke('whatsapp:status'),

    // Start WhatsApp connection
    start: () => ipcRenderer.invoke('whatsapp:start'),

    // Stop WhatsApp connection
    stop: () => ipcRenderer.invoke('whatsapp:stop'),

    // Logout and clear session
    logout: () => ipcRenderer.invoke('whatsapp:logout'),

    // Send a message
    send: (phoneNumber, text) => ipcRenderer.invoke('whatsapp:send', { phoneNumber, text }),

    // Allowlist management
    allowlist: {
      get: () => ipcRenderer.invoke('whatsapp:allowlist:get'),
      add: (phoneNumber) => ipcRenderer.invoke('whatsapp:allowlist:add', phoneNumber),
      remove: (phoneNumber) => ipcRenderer.invoke('whatsapp:allowlist:remove', phoneNumber),
    },

    // Event listeners
    onQr: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('whatsapp:qr', subscription);
      return () => ipcRenderer.removeListener('whatsapp:qr', subscription);
    },
    onConnected: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('whatsapp:connected', subscription);
      return () => ipcRenderer.removeListener('whatsapp:connected', subscription);
    },
    onDisconnected: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('whatsapp:disconnected', subscription);
      return () => ipcRenderer.removeListener('whatsapp:disconnected', subscription);
    },
  },

  // ============================================
  // AUTH MANAGER API
  // ============================================
  auth: {
    // List auth profiles
    listProfiles: (provider) => ipcRenderer.invoke('auth:profiles:list', provider),

    // Create auth profile
    createProfile: (params) => ipcRenderer.invoke('auth:profiles:create', params),

    // Delete auth profile
    deleteProfile: (profileId) => ipcRenderer.invoke('auth:profiles:delete', profileId),

    // Resolve API key for provider
    resolve: (provider, profileId) => ipcRenderer.invoke('auth:resolve', { provider, profileId }),

    // Validate API key
    validate: (provider, apiKey) => ipcRenderer.invoke('auth:validate', { provider, apiKey }),
  },

  // ============================================
  // PERSONALITY LOADER API
  // ============================================
  personality: {
    // Get system prompt
    getPrompt: (params) => ipcRenderer.invoke('personality:get-prompt', params),

    // Read context file
    readFile: (filename) => ipcRenderer.invoke('personality:read-file', filename),

    // Write context file
    writeFile: (filename, content) => ipcRenderer.invoke('personality:write-file', { filename, content }),

    // Add memory entry
    addMemory: (entry) => ipcRenderer.invoke('personality:add-memory', entry),

    // List context files
    listFiles: () => ipcRenderer.invoke('personality:list-files'),

    // Remember a fact about the user in long-term memory
    rememberFact: (key, value) => ipcRenderer.invoke('personality:remember-fact', { key, value }),
  },
};

// Expose to renderer
try {
  contextBridge.exposeInMainWorld('electron', electronHandler);
  console.log('[Preload] contextBridge.exposeInMainWorld succeeded');
  console.log('[Preload] Available APIs:', Object.keys(electronHandler).join(', '));
} catch (error) {
  console.error('[Preload] Failed to expose electron API:', error);
}

console.log('[Preload] Script loaded successfully');

// Export type for TypeScript
// (will be used in global.d.ts)
module.exports = { electronHandler };
