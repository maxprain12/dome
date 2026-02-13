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
    // Avatar
    'select-avatar',
    'avatar:copy',
    'avatar:delete',
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
    // Database - Interactions
    'db:interactions:create',
    'db:interactions:getByResource',
    'db:tags:getByResource',
    'db:interactions:getByType',
    'db:interactions:update',
    'db:interactions:delete',
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
    'resource:export',
    'resource:delete',
    'resource:regenerateThumbnail',
    'resource:setThumbnail',
    // File operations
    'file:generateHash',
    'file:readFile',
    'file:readFileAsText',
    'file:writeFile',
    'file:deleteFile',
    'file:listDirectory',
    'file:copyFile',
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
    // Web scraping
    'web:scrape',
    'web:get-youtube-thumbnail',
    'web:save-screenshot',
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
    // Vector Database - Annotations
    'vector:annotations:index',
    'vector:annotations:search',
    'vector:annotations:delete',
    'vector:search:generic',
    'vector:semanticSearch',
    // General Vector Database
    'vector:add',
    'vector:search',
    'vector:delete',
    'vector:count',
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
    // Personality Loader
    'personality:get-prompt',
    'personality:read-file',
    'personality:write-file',
    'personality:add-memory',
    'personality:list-files',
    // AI Cloud (OpenAI, Anthropic, Google)
    'ai:chat',
    'ai:stream',
    'ai:embeddings',
    'ai:checkClaudeMaxProxy',
    'ai:testConnection',
    // AI Tools (for Many agent)
    'ai:tools:resourceSearch',
    'ai:tools:resourceGet',
    'ai:tools:resourceList',
    'ai:tools:resourceSemanticSearch',
    'ai:tools:projectList',
    'ai:tools:projectGet',
    'ai:tools:interactionList',
    'ai:tools:getRecentResources',
    'ai:tools:getCurrentProject',
    // AI Tools - Resource Actions (for Many agent)
    'ai:tools:resourceCreate',
    'ai:tools:resourceUpdate',
    'ai:tools:resourceDelete',
    // AI Tools - Flashcards
    'ai:tools:flashcardCreate',
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
    // Vector Database - Annotations
    'vector:annotations:index',
    'vector:annotations:search',
    'vector:annotations:delete',
    'vector:search:generic',
    'vector:semanticSearch',
    // Notebook (Python via IPC)
    'notebook:runPython',
    'notebook:checkPython',
    // Auto-updater
    'updater:check',
    'updater:download',
    'updater:install',
    // Sync export/import
    'sync:export',
    'sync:import',
    // Plugins
    'plugin:list',
    'plugin:install-from-folder',
    'plugin:install-from-repo',
    'plugin:uninstall',
    'plugin:setEnabled',
  ],
  // Canales para on/once (main → renderer)
  on: [
    'theme-changed',
    // Resource events
    'resource:created',
    'resource:updated',
    'resource:deleted',
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
    // Flashcard events
    'flashcard:deckCreated',
    'flashcard:deckUpdated',
    'flashcard:deckDeleted',
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
  // USER SETTINGS
  // ============================================
  selectAvatar: () => ipcRenderer.invoke('select-avatar'),
  openSettings: () => ipcRenderer.invoke('window:open-settings'),

  // ============================================
  // AVATAR MANAGEMENT
  // ============================================
  avatar: {
    copyFile: (sourcePath) => ipcRenderer.invoke('avatar:copy', sourcePath),
    deleteAvatar: (relativePath) => ipcRenderer.invoke('avatar:delete', relativePath),
  },

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
  // PLUGINS API
  // ============================================
  plugins: {
    list: () => ipcRenderer.invoke('plugin:list'),
    installFromFolder: () => ipcRenderer.invoke('plugin:install-from-folder'),
    installFromRepo: (repo) => ipcRenderer.invoke('plugin:install-from-repo', repo),
    uninstall: (pluginId) => ipcRenderer.invoke('plugin:uninstall', pluginId),
    setEnabled: (pluginId, enabled) => ipcRenderer.invoke('plugin:setEnabled', pluginId, enabled),
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

    // Resource Interactions (notes, annotations, chat)
    interactions: {
      create: (interaction) => ipcRenderer.invoke('db:interactions:create', interaction),
      getByResource: (resourceId) => ipcRenderer.invoke('db:interactions:getByResource', resourceId),
      getByType: (resourceId, type) => ipcRenderer.invoke('db:interactions:getByType', { resourceId, type }),
      update: (interaction) => ipcRenderer.invoke('db:interactions:update', interaction),
      delete: (id) => ipcRenderer.invoke('db:interactions:delete', id),
    },

    // Tags
    tags: {
      getByResource: (resourceId) => ipcRenderer.invoke('db:tags:getByResource', resourceId),
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
  // WORKSPACE API
  // ============================================
  workspace: {
    // Open a workspace window for a resource
    open: (resourceId, resourceType) =>
      ipcRenderer.invoke('window:open-workspace', { resourceId, resourceType }),
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

    // List directory contents
    listDirectory: (dirPath) => ipcRenderer.invoke('file:listDirectory', dirPath),

    // Copy file (for notebook workspace)
    copyFile: (sourcePath, destPath) => ipcRenderer.invoke('file:copyFile', sourcePath, destPath),

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

    // Get migration status
    getStatus: () => ipcRenderer.invoke('migration:getStatus'),
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
  // AI CLOUD API (OpenAI, Anthropic, Google)
  // ============================================
  ai: {
    // Chat with cloud provider (non-streaming)
    chat: (provider, messages, model) => 
      ipcRenderer.invoke('ai:chat', { provider, messages, model }),

    // Stream chat with cloud provider (tools passed for provider-level tool support)
    stream: (provider, messages, model, streamId, tools) =>
      ipcRenderer.invoke('ai:stream', { provider, messages, model, streamId, tools }),

    // Listen for stream chunks
    onStreamChunk: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('ai:stream:chunk', subscription);
      return () => ipcRenderer.removeListener('ai:stream:chunk', subscription);
    },

    // Generate embeddings
    embeddings: (provider, texts, model) =>
      ipcRenderer.invoke('ai:embeddings', { provider, texts, model }),

    // Check if claude-max-api-proxy is available (for Claude Pro/Max subscriptions)
    checkClaudeMaxProxy: () =>
      ipcRenderer.invoke('ai:checkClaudeMaxProxy'),

    // Test AI connection (minimal API call to verify config)
    testConnection: () =>
      ipcRenderer.invoke('ai:testConnection'),

    // AI Tools for Many agent
    tools: {
      // Search resources using full-text search
      resourceSearch: (query, options) =>
        ipcRenderer.invoke('ai:tools:resourceSearch', { query, options }),

      // Get resource by ID with full content
      resourceGet: (resourceId, options) =>
        ipcRenderer.invoke('ai:tools:resourceGet', { resourceId, options }),

      // List resources with optional filters
      resourceList: (options) =>
        ipcRenderer.invoke('ai:tools:resourceList', { options }),

      // Semantic search using embeddings
      resourceSemanticSearch: (query, options) =>
        ipcRenderer.invoke('ai:tools:resourceSemanticSearch', { query, options }),

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

      // Resource Actions (Create, Update, Delete)
      resourceCreate: (data) =>
        ipcRenderer.invoke('ai:tools:resourceCreate', { data }),

      resourceUpdate: (resourceId, updates) =>
        ipcRenderer.invoke('ai:tools:resourceUpdate', { resourceId, updates }),

      resourceDelete: (resourceId) =>
        ipcRenderer.invoke('ai:tools:resourceDelete', { resourceId }),

      // Flashcard creation (for AI-generated study decks)
      flashcardCreate: (data) =>
        ipcRenderer.invoke('ai:tools:flashcardCreate', { data }),
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
  // VECTOR DATABASE API
  // ============================================
  vector: {
    // General methods
    add: (items) => ipcRenderer.invoke('vector:add', items),
    search: (query, options) => ipcRenderer.invoke('vector:search:generic', query, options),
    delete: (filter) => ipcRenderer.invoke('vector:delete', filter),
    count: () => ipcRenderer.invoke('vector:count'),

    annotations: {
      // Index annotation in LanceDB
      index: (annotationData) => ipcRenderer.invoke('vector:annotations:index', annotationData),

      // Search annotations
      search: (queryData) => ipcRenderer.invoke('vector:annotations:search', queryData),

      // Delete annotation from LanceDB
      delete: (annotationId) => ipcRenderer.invoke('vector:annotations:delete', annotationId),
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
      }),
    checkPython: () => ipcRenderer.invoke('notebook:checkPython'),
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
