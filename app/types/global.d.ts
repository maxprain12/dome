export { };

// Raw text imports for prompts
declare module '*.txt?raw' {
  const content: string;
  export default content;
}

// Tiptap custom commands declaration
import type { MCPServerConfig, MCPToolConfig, Resource } from '@/types';

type ThemeChangeCallback = (theme: 'light' | 'dark') => void;
type RemoveListenerFn = () => void;

// Database types
interface DBResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  created_at: number;
  updated_at: number;
}

// Resource import result
interface ResourceImportResult {
  success: boolean;
  data?: Resource;
  thumbnailDataUrl?: string;
  error?: string;
  duplicate?: {
    id: string;
    title: string;
    projectId: string;
  };
}

// Storage usage statistics
interface StorageUsage {
  total: number;
  byType: Record<string, number>;
  fileCount: number;
}

// Migration status
interface MigrationStatus {
  pendingMigrations: number;
  resources: Array<{
    id: string;
    title: string;
    file_path: string;
  }>;
}

// Migration result
interface MigrationResult {
  migrated: number;
  failed: number;
  errors?: Array<{
    id: string;
    error: string;
  }>;
}

type InteractionType = 'annotation' | 'chat';

interface ResourceInteraction {
  id: string;
  resource_id: string;
  type: InteractionType;
  content: string;
  position_data?: string;
  metadata?: string;
  created_at: number;
  updated_at: number;
}

interface ResourceLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  weight: number;
  metadata?: string;
  created_at: number;
}

interface UnifiedSearchResult {
  resources: Resource[];
  interactions: (ResourceInteraction & { resource_title: string })[];
  studioOutputs?: Array<{
    id: string;
    title?: string;
    content?: string;
    updated_at?: number;
  }>;
}

// Knowledge Graph Types
interface GraphNode {
  id: string;
  resource_id?: string;
  label: string;
  type: 'resource' | 'concept' | 'person' | 'location' | 'event' | 'topic';
  properties?: Record<string, any>;
  created_at: number;
  updated_at: number;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  weight: number;
  metadata?: Record<string, any>;
  created_at: number;
  updated_at: number;
}

declare global {
  interface Window {
    electron: {
      // System Paths
      getUserDataPath: () => Promise<string>;
      getHomePath: () => Promise<string>;
      getAppVersion: () => Promise<string>;

      // File Dialogs
      selectFile: (options?: {
        filters?: Array<{ name: string; extensions: string[] }>;
        properties?: string[];
      }) => Promise<string[]>;
      selectFiles: (options?: {
        filters?: Array<{ name: string; extensions: string[] }>;
        properties?: string[];
      }) => Promise<string[]>;
      selectFolder: () => Promise<string | undefined>;
      showSaveDialog: (options?: {
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<string | undefined>;

      // Get file path from dropped File object (drag-and-drop support)
      getPathForFile: (file: File) => string | null;
      getPathsForFiles: (files: File[]) => string[];

      // File System Operations
      openPath: (filePath: string) => Promise<string>;
      showItemInFolder: (filePath: string) => Promise<void>;

      // File API (workspace, notebook import/export)
      file: {
        listDirectory: (dirPath: string) => Promise<{ success: boolean; data?: Array<{ name: string; isDirectory: boolean; path: string }>; error?: string }>;
        readFileAsText: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
        writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
        copyFile: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>;
        readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      };

      // Theme
      getTheme: () => Promise<'light' | 'dark'>;
      setTheme: (theme: 'light' | 'dark' | 'auto') => Promise<'light' | 'dark'>;
      onThemeChanged: (callback: ThemeChangeCallback) => RemoveListenerFn;

      // User Settings
      openSettings: (options?: { section?: string }) => Promise<{ success: boolean; windowId?: string; error?: string }>;

      // IPC Communication
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      /** KB LLM automations & settings (optional until preload loads) */
      kbllm?: {
        getGlobal: () => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;
        setGlobal: (payload: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        getProjectOverride: (projectId: string) => Promise<{ success: boolean; data?: { override?: string }; error?: string }>;
        setProjectOverride: (payload: {
          projectId: string;
          override: 'inherit' | 'enabled' | 'disabled';
        }) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        syncProject: (projectId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        syncAll: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
        getStatus: (projectId?: string) => Promise<{
          success: boolean;
          data?: {
            effectiveEnabled?: boolean;
            lastRuns?: {
              compile: { status?: string; finishedAt?: number | null; updatedAt?: number } | null;
              health: unknown;
            };
          };
          error?: string;
        }>;
      };
      on: (channel: string, callback: (...args: any[]) => void) => RemoveListenerFn;
      once: (channel: string, callback: (...args: any[]) => void) => void;
      send: (channel: string, ...args: any[]) => void;
      removeAllListeners: (channel: string) => void;

      // Platform Info
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
      platform: string;

      // Environment
      isDev: boolean;
      isProduction: boolean;
      nodeVersion: string;
      chromeVersion: string;
      electronVersion: string;

      // Initialization API
      init: {
        initialize: () => Promise<{ success: boolean; needsOnboarding: boolean }>;
        checkOnboarding: () => Promise<{ success: boolean; needsOnboarding: boolean }>;
        getStatus: () => Promise<{ success: boolean; isInitialized: boolean }>;
      };

      // Auto-updater API
      updater: {
        check: () => Promise<unknown>;
        download: () => Promise<unknown>;
        install: () => Promise<void>;
        skip: (version: string) => Promise<{ ok: boolean; error?: string }>;
        onStatus: (cb: (s: { status: string; version?: string; percent?: number; error?: string; [key: string]: unknown }) => void) => () => void;
      };

      // Sync API
      sync: {
        export: () => Promise<{ success?: boolean; path?: string; cancelled?: boolean; error?: string }>;
        import: () => Promise<{ success?: boolean; restartRequired?: boolean; cancelled?: boolean; error?: string }>;
      };

      // Calendar API
      calendar: {
        connectGoogle: () => Promise<{ success: boolean; accountId?: string; error?: string }>;
        getGoogleAccounts: () => Promise<{ success: boolean; accounts?: { id: string; account_email: string; status: string }[]; error?: string }>;
        listCalendars: (accountId?: string | null) => Promise<{ success: boolean; calendars?: any[]; error?: string }>;
        listEvents: (params: { startMs: number; endMs: number; calendarIds?: string[] }) => Promise<{ success: boolean; events?: any[]; error?: string }>;
        createEvent: (data: any) => Promise<{ success: boolean; event?: any; error?: string }>;
        updateEvent: (eventId: string, updates: any) => Promise<{ success: boolean; event?: any; error?: string }>;
        deleteEvent: (eventId: string) => Promise<{ success: boolean; deleted?: boolean; error?: string }>;
        syncNow: () => Promise<{ success: boolean; synced?: boolean; message?: string; error?: string }>;
        getUpcoming: (params?: { windowMinutes?: number; limit?: number }) => Promise<{ success: boolean; events?: any[]; error?: string }>;
        getSettings: () => Promise<{
          success: boolean;
          settings?: {
            sync_auto_enabled: boolean;
            sync_interval_minutes: number;
            in_app_notifications_enabled: boolean;
            in_app_reminder_lead_minutes: number;
          };
          error?: string;
        }>;
        setSettings: (partial: {
          sync_auto_enabled?: boolean;
          sync_interval_minutes?: number;
          in_app_notifications_enabled?: boolean;
          in_app_reminder_lead_minutes?: number;
        }) => Promise<{ success: boolean; settings?: any; error?: string }>;
        setCalendarSelected: (calendarId: string, isSelected: boolean) => Promise<{ success: boolean; error?: string }>;
        disconnectGoogle: (accountId: string) => Promise<{ success: boolean; error?: string }>;
        previewIcs: (filePath: string) => Promise<{
          success: boolean;
          events?: Array<Record<string, unknown>>;
          rawCount?: number;
          error?: string;
        }>;
        importIcs: (
          filePath: string,
          calendarId: string,
          options?: { skipDuplicates?: boolean },
        ) => Promise<{
          success: boolean;
          imported?: number;
          skipped?: number;
          totalParsed?: number;
          errors?: string[];
          error?: string;
        }>;
        onUpcoming: (callback: (data: any) => void) => RemoveListenerFn;
        onEventCreated: (callback: (data: any) => void) => RemoveListenerFn;
        onEventUpdated: (callback: (data: any) => void) => RemoveListenerFn;
        onEventDeleted: (callback: (data: any) => void) => RemoveListenerFn;
        onSyncStatus: (callback: (data: any) => void) => RemoveListenerFn;
      };

      // MCP API
      mcp: {
        testConnection: () => Promise<{ success: boolean; toolCount: number; error?: string }>;
        testServer: (server: MCPServerConfig) => Promise<{ success: boolean; toolCount: number; tools?: MCPToolConfig[]; error?: string }>;
        startOAuthFlow: (providerId: string) => Promise<{ success: boolean; token?: string; error?: string }>;
        getOAuthProviders: () => Promise<string[]>;
      };

      // Dome Provider OAuth API
      domeAuth: {
        startOAuthFlow: () => Promise<{ success: boolean; connected?: boolean; error?: string }>;
        openDashboard: () => Promise<{ success: boolean; error?: string }>;
        getSession: () => Promise<{ success: boolean; connected: boolean; userId?: string; error?: string }>;
        disconnect: () => Promise<{ success: boolean; error?: string }>;
        getQuota: () => Promise<{
          success: boolean;
          planId?: string;
          limit?: number;
          used?: number;
          remaining?: number;
          periodEnd?: number;
          subscriptionStatus?: string;
          error?: string;
        }>;
      };

      // Plugins API
      plugins: {
        list: () => Promise<{ success: boolean; data?: any[] }>;
        installFromFolder: () => Promise<{ success?: boolean; cancelled?: boolean; error?: string }>;
        installFromRepo: (repo: string) => Promise<{ success?: boolean; error?: string }>;
        uninstall: (id: string) => Promise<{ success: boolean; error?: string }>;
        setEnabled: (id: string, enabled: boolean) => Promise<{ success: boolean }>;
        readAsset: (pluginId: string, relativePath: string) => Promise<{ success: boolean; dataUrl?: string; text?: string; error?: string }>;
      };

      // Marketplace API (catalog sync, plugin zip install from dialog)
      marketplace: {
        fetchAll: () => Promise<unknown>;
        fetchAgents: () => Promise<unknown>;
        fetchWorkflows: () => Promise<unknown>;
        fetchMcp: () => Promise<unknown>;
        fetchSkills: () => Promise<unknown>;
        fetchPlugins: () => Promise<unknown>;
        getConfig: () => Promise<unknown>;
        updateConfig: (config: unknown) => Promise<unknown>;
        refresh: () => Promise<unknown>;
        getRateLimit: () => Promise<unknown>;
        installPlugin: () => Promise<{ success: boolean; error?: string }>;
        installSkill: () => Promise<unknown>;
        uninstallSkill: (skillId: string) => Promise<unknown>;
      };

      // Database API
      db: {
        projects: {
          create: (project: any) => Promise<DBResponse<Project>>;
          getAll: () => Promise<DBResponse<Project[]>>;
          getById: (id: string) => Promise<DBResponse<Project>>;
          getDeletionImpact: (projectId: string) => Promise<DBResponse<Record<string, number>>>;
          deleteWithContent: (projectId: string) => Promise<DBResponse<void>>;
        };
        resources: {
          create: (resource: any) => Promise<DBResponse<Resource>>;
          getByProject: (projectId: string) => Promise<DBResponse<Resource[]>>;
          getById: (id: string) => Promise<DBResponse<Resource>>;
          update: (resource: any) => Promise<DBResponse<Resource>>;
          search: (query: string) => Promise<DBResponse<Resource[]>>;
          getAll: (limit?: number) => Promise<DBResponse<Resource[]>>;
          delete: (id: string) => Promise<DBResponse<void>>;
          bulkDelete: (resourceIds: string[]) => Promise<DBResponse<{ deletedIds: string[] }>>;
          // Folder containment
          getByFolder: (folderId: string) => Promise<DBResponse<Resource[]>>;
          getRoot: (projectId?: string) => Promise<DBResponse<Resource[]>>;
          moveToFolder: (resourceId: string, folderId: string | null) => Promise<DBResponse<void>>;
          moveToProject: (
            resourceId: string,
            projectId: string,
          ) => Promise<DBResponse<{ movedIds: string[] }>>;
          removeFromFolder: (resourceId: string) => Promise<DBResponse<void>>;
          // Backlinks
          getBacklinks: (resourceId: string) => Promise<DBResponse<Resource[]>>;
          // Search for mentions
          searchForMention: (query: string) => Promise<DBResponse<Resource[]>>;
        };
        interactions: {
          create: (interaction: any) => Promise<DBResponse<ResourceInteraction>>;
          getByResource: (resourceId: string) => Promise<DBResponse<ResourceInteraction[]>>;
          getByType: (resourceId: string, type: InteractionType) => Promise<DBResponse<ResourceInteraction[]>>;
          update: (interaction: any) => Promise<DBResponse<ResourceInteraction>>;
          delete: (id: string) => Promise<DBResponse<void>>;
        };
        chat: {
          createSession: (opts: {
            id?: string;
            agentId?: string | null;
            resourceId?: string | null;
            mode?: 'many' | 'agent' | 'team' | 'workflow' | 'canvas' | null;
            contextId?: string | null;
            threadId?: string | null;
            title?: string | null;
            toolIds?: string[];
            mcpServerIds?: string[];
            projectId?: string;
          }) => Promise<DBResponse<unknown>>;
          getSession: (sessionId: string) => Promise<DBResponse<unknown>>;
          updateSession: (opts: {
            id: string;
            mode?: 'many' | 'agent' | 'team' | 'workflow' | 'canvas' | null;
            contextId?: string | null;
            threadId?: string | null;
            title?: string | null;
            toolIds?: string[];
            mcpServerIds?: string[];
          }) => Promise<DBResponse<void>>;
          getSessionsByAgent: (opts: { agentId: string; limit?: number; projectId?: string }) => Promise<DBResponse<unknown[]>>;
          getSessionsGlobal: (limitOrOpts?: number | { limit?: number; projectId?: string }) => Promise<DBResponse<unknown[]>>;
          addMessage: (opts: {
            sessionId: string;
            role: 'user' | 'assistant';
            content: string;
            toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown>; status?: string; result?: unknown; error?: string }>;
            thinking?: string | null;
            metadata?: Record<string, unknown>;
          }) => Promise<DBResponse<unknown>>;
          appendTrace: (opts: {
            sessionId: string;
            messageId?: string | null;
            type: 'tool_call' | 'tool_result' | 'decision' | 'interrupt';
            toolName?: string | null;
            toolArgs?: Record<string, unknown>;
            result?: unknown;
            mcpServerId?: string | null;
            decision?: string | null;
          }) => Promise<DBResponse<{ id: string }>>;
        };
        tags: {
          getByResource: (resourceId: string) => Promise<DBResponse<Array<{ id: string; name: string; color?: string }>>>;
          getAll: () => Promise<DBResponse<Array<{ id: string; name: string; color?: string | null; resource_count: number }>>>;
          getResources: (tagId: string) => Promise<DBResponse<Array<{ id: string; title: string; type: string; updated_at: number }>>>;
        };
        links: {
          create: (link: any) => Promise<DBResponse<ResourceLink>>;
          getBySource: (sourceId: string) => Promise<DBResponse<ResourceLink[]>>;
          getByTarget: (targetId: string) => Promise<DBResponse<ResourceLink[]>>;
          delete: (id: string) => Promise<DBResponse<void>>;
        };
        graph: {
          createNode: (node: Partial<GraphNode>) => Promise<DBResponse<GraphNode>>;
          getNode: (nodeId: string) => Promise<DBResponse<GraphNode>>;
          getNodesByType: (type: string) => Promise<DBResponse<GraphNode[]>>;
          createEdge: (edge: Partial<GraphEdge>) => Promise<DBResponse<GraphEdge>>;
          getNeighbors: (nodeId: string) => Promise<DBResponse<GraphNode[]>>;
          searchNodes: (query: string) => Promise<DBResponse<GraphNode[]>>;
        };
        search: {
          unified: (query: string) => Promise<DBResponse<UnifiedSearchResult>>;
        };
        flashcards: {
          createDeck: (deck: any) => Promise<DBResponse<any>>;
          getDeck: (id: string) => Promise<DBResponse<any>>;
          getDecksByProject: (projectId: string) => Promise<DBResponse<any[]>>;
          getAllDecks: (limit?: number) => Promise<DBResponse<any[]>>;
          updateDeck: (deck: any) => Promise<DBResponse<any>>;
          deleteDeck: (id: string) => Promise<DBResponse<void>>;
          createCard: (card: any) => Promise<DBResponse<any>>;
          createCards: (deckId: string, cards: any[]) => Promise<DBResponse<any>>;
          getCards: (deckId: string) => Promise<DBResponse<any[]>>;
          getDueCards: (deckId: string, limit?: number) => Promise<DBResponse<any[]>>;
          reviewCard: (cardId: string, quality: number) => Promise<DBResponse<any>>;
          updateCard: (card: any) => Promise<DBResponse<any>>;
          deleteCard: (id: string) => Promise<DBResponse<void>>;
          getStats: (deckId: string) => Promise<DBResponse<any>>;
          createSession: (session: any) => Promise<DBResponse<any>>;
          getSessions: (deckId: string, limit?: number) => Promise<DBResponse<any[]>>;
        };
        studio: {
          create: (data: any) => Promise<DBResponse<any>>;
          getAll: (limit?: number) => Promise<DBResponse<any[]>>;
          getByProject: (projectId: string) => Promise<DBResponse<any[]>>;
          getById: (id: string) => Promise<DBResponse<any>>;
          update: (id: string, updates: any) => Promise<DBResponse<void>>;
          delete: (id: string) => Promise<DBResponse<void>>;
        };
        settings: {
          get: (key: string) => Promise<DBResponse<string>>;
          set: (key: string, value: string) => Promise<DBResponse<void>>;
        };
      };

      // Workspace API
      workspace: {
        open: (
          resourceId: string,
          resourceType: string,
          options?: { page?: number }
        ) => Promise<{
          success: boolean;
          data?: { windowId: string; resourceId: string; title: string };
          error?: string;
        }>;
        openFolder: (folderId: string) => Promise<{
          success: boolean;
          data?: { windowId: string; folderId: string; title: string };
          error?: string;
        }>;
      };

      // Resource File Storage API
      resource: {
        import: (
          filePath: string,
          projectId: string,
          type: string,
          title?: string
        ) => Promise<ResourceImportResult>;
        importMultiple: (
          filePaths: string[],
          projectId: string,
          type?: string
        ) => Promise<{
          success: boolean;
          data: Array<{ success: boolean; data: Resource }>;
          errors?: Array<{ filePath: string; error: string }>;
        }>;
        getFilePath: (resourceId: string) => Promise<DBResponse<string>>;
        readFile: (resourceId: string) => Promise<DBResponse<string>>;
        readFileBuffer: (
          resourceId: string
        ) => Promise<
          | { success: true; data: ArrayBuffer; mimeType: string }
          | { success: false; error?: string }
        >;
        readDocumentContent: (resourceId: string) => Promise<{
          success: boolean;
          data?: string;
          mimeType?: string;
          filename?: string;
          error?: string;
        }>;
        extractPptImages: (resourceId: string) => Promise<{
          success: boolean;
          slides?: Array<{ index: number; image_base64: string }>;
          error?: string;
        }>;
        writeExcelContent: (resourceId: string, data: string) => Promise<{
          success: boolean;
          error?: string;
        }>;
        saveDocxFromHtml: (resourceId: string, html: string) => Promise<{
          success: boolean;
          data?: Resource;
          error?: string;
        }>;
        export: (
          resourceId: string,
          destinationPath: string
        ) => Promise<DBResponse<string>>;
        delete: (resourceId: string) => Promise<DBResponse<void>>;
        regenerateThumbnail: (resourceId: string) => Promise<DBResponse<string>>;
        setThumbnail: (resourceId: string, thumbnailDataUrl: string) => Promise<DBResponse<void>>;
        scheduleIndex: (resourceId: string) => Promise<{ success: boolean; error?: string }>;
        importFromContent: (args: {
          title: string;
          content?: string;
          content_base64?: string;
          mime_type?: string;
          filename?: string;
          type?: string;
          project_id?: string;
          folder_id?: string | null;
        }) => Promise<{ success: boolean; resource?: Resource; error?: string; duplicate?: { id: string; title: string; projectId?: string } }>;
      };

      // Storage Management API
      storage: {
        getUsage: () => Promise<DBResponse<StorageUsage>>;
        cleanup: () => Promise<DBResponse<{ deleted: number; freedBytes: number }>>;
        getPath: () => Promise<DBResponse<string>>;
      };

      // Migration API
      migration: {
        migrateResources: () => Promise<DBResponse<MigrationResult>>;
        getStatus: () => Promise<DBResponse<MigrationStatus>>;
        getNotesMigrationStatus: () => Promise<
          DBResponse<{ pendingMigrations: number; notes: Array<{ id: string; title: string }> }>
        >;
        migrateNotesToDomain: () => Promise<DBResponse<{ migrated?: number; error?: string }>>;
      };

      /** Docling: PDF conversion progress and image APIs */
      docling?: {
        onProgress: (
          callback: (event: { resourceId: string; status: string; progress?: number }) => void,
        ) => RemoveListenerFn;
        convertResource: (resourceId: string) => Promise<{ success?: boolean; error?: string }>;
        getImageData?: (imageId: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      };

      // Web Scraping API
      web: {
        scrape: (request:
          | string
          | {
            url: string;
            selector?: string;
            includeMetadata?: boolean;
            includeScreenshot?: boolean;
            maxLength?: number;
            timeoutMs?: number;
            userAgent?: string;
          }) => Promise<{
          success: boolean;
          url: string;
          finalUrl?: string;
          title?: string | null;
          content?: string | null;
          metadata?: any;
          screenshot?: string | null;
          screenshotFormat?: string;
          warnings?: string[];
          excerpt?: string;
          consentBlocked?: boolean;
          consentStrategyUsed?: string;
          consentSignalScore?: number;
          error?: string;
        }>;
        getYouTubeThumbnail: (url: string) => Promise<{
          success: boolean;
          videoId?: string | null;
          thumbnail?: {
            internalPath: string;
            hash: string;
            size: number;
            dataUrl: string;
          } | null;
          metadata?: any;
          error?: string;
        }>;
        saveScreenshot: (
          resourceId: string,
          screenshotBase64?: string,
          internalPath?: string
        ) => Promise<{
          success: boolean;
          thumbnailData?: string;
          internalPath?: string;
          error?: string;
        }>;
        process: (resourceId: string) => Promise<{
          success: boolean;
          metadata?: any;
          error?: string;
        }>;
      };

      // Image Processing
      image: {
        crop: (options: {
          filePath: string;
          x?: number;
          y?: number;
          width: number;
          height: number;
          format?: 'jpeg' | 'png' | 'webp';
          quality?: number;
          maxWidth?: number;
          maxHeight?: number;
        }) => Promise<{
          success: boolean;
          dataUrl?: string;
          error?: string;
        }>;
        resize: (options: {
          filePath: string;
          width?: number;
          height?: number;
          fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
          format?: 'jpeg' | 'png' | 'webp';
          quality?: number;
        }) => Promise<{
          success: boolean;
          dataUrl?: string;
          error?: string;
        }>;
        thumbnail: (options: {
          filePath: string;
          maxWidth?: number;
          maxHeight?: number;
          format?: 'jpeg' | 'png' | 'webp';
          quality?: number;
        }) => Promise<{
          success: boolean;
          dataUrl?: string;
          error?: string;
        }>;
        metadata: (filePath: string) => Promise<{
          success: boolean;
          metadata?: {
            width: number;
            height: number;
            format: string;
            space?: string;
            channels?: number;
            depth?: string;
            density?: number;
            hasAlpha?: boolean;
            orientation?: number;
          };
          error?: string;
        }>;
      };

      // AI Cloud API (OpenAI, Anthropic, Google)
      ai: {
        chat: (
          provider: 'openai' | 'anthropic' | 'google' | 'dome' | 'minimax',
          messages: Array<{ role: string; content: string }>,
          model?: string
        ) => Promise<{
          success: boolean;
          content?: string;
          error?: string;
        }>;
        testWebSearch: () => Promise<{
          success: boolean;
          provider?: string;
          count?: number;
          warning?: string;
          error?: string;
        }>;
        webSearch: (args: {
          query: string;
          count?: number;
          country?: string;
          search_lang?: string;
          freshness?: string;
        }) => Promise<{
          status?: string;
          query?: string;
          provider?: string;
          engine?: string;
          count?: number;
          results?: Array<{
            title: string;
            url: string;
            description?: string;
            displayedUrl?: string;
            siteName?: string;
          }>;
          error?: string;
          cached?: boolean;
        }>;
        stream: (
          provider: 'openai' | 'anthropic' | 'google' | 'dome' | 'ollama' | 'minimax',
          messages: Array<{ role: string; content: string }>,
          model: string | undefined,
          streamId: string,
          tools?: Array<{
            type: string;
            function: {
              name: string;
              description: string;
              parameters: Record<string, any>;
            };
          }>
        ) => Promise<{
          success: boolean;
          content?: string;
          error?: string;
        }>;
        streamLangGraph: (
          provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'minimax',
          messages: Array<{ role: string; content: string }>,
          model: string,
          streamId: string,
          toolDefinitions: Array<{
            type: string;
            function: {
              name: string;
              description: string;
              parameters?: Record<string, any>;
            };
          }>,
          threadId?: string,
          skipHitl?: boolean,
          mcpServerIds?: string[],
          subagentIds?: Array<'research' | 'library' | 'writer' | 'data'>
        ) => Promise<{ success: boolean; error?: string }>;
        abortLangGraph: (streamId: string) => Promise<void>;
        resumeLangGraph: (opts: {
          threadId: string;
          streamId: string;
          decisions: Array<{ type: 'approve' } | { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } } | { type: 'reject'; message?: string }>;
          provider?: string;
          model?: string;
        }) => Promise<{ success: boolean; interrupted?: boolean; threadId?: string; error?: string }>;
        onStreamChunk: (callback: (data: {
          streamId: string;
          type?: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'interrupt';
          text?: string;
          error?: string;
          toolCall?: {
            id: string;
            name: string;
            arguments: string;
          };
          toolCallId?: string;
          result?: string;
          actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
          reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>;
          // Agent Team fields
          chunk?: string;
          done?: boolean;
          agentName?: string | null;
        }) => void) => RemoveListenerFn;
        embeddings: (
          provider: 'openai' | 'google' | 'anthropic',
          texts: string[],
          model?: string
        ) => Promise<{
          success: boolean;
          embeddings?: number[][];
          error?: string;
        }>;
        testConnection: () => Promise<{
          success: boolean;
          provider?: string;
          model?: string;
          message?: string;
          error?: string;
        }>;
        // AI Tools for Many agent
        tools: {
          resourceSearch: (
            query: string,
            options?: {
              project_id?: string;
              type?: string;
              limit?: number;
            }
          ) => Promise<{
            success: boolean;
            query?: string;
            count?: number;
            results?: Array<{
              id: string;
              title: string;
              type: string;
              project_id: string;
              snippet: string;
              created_at: number;
              updated_at: number;
              metadata?: Record<string, any>;
            }>;
            error?: string;
          }>;
          resourceGet: (
            resourceId: string,
            options?: {
              includeContent?: boolean;
              maxContentLength?: number;
            }
          ) => Promise<{
            success: boolean;
            resource?: {
              id: string;
              title: string;
              type: string;
              project_id: string;
              content?: string;
              content_truncated?: boolean;
              full_length?: number;
              transcription?: string;
              transcription_truncated?: boolean;
              summary?: string;
              created_at: number;
              updated_at: number;
              metadata?: Record<string, any>;
            };
            error?: string;
          }>;
          resourceGetSection: (
            resourceId: string,
            nodeId: string
          ) => Promise<{
            success: boolean;
            resource_id?: string;
            title?: string;
            section?: {
              node_id: string;
              title: string;
              summary: string;
              start_index: number;
              end_index: number;
              page_range: string;
              node_path: string[];
              children: Array<{ node_id: string; title: string }>;
            };
            error?: string;
          }>;
          resourceList: (options?: {
            project_id?: string;
            folder_id?: string | null;
            type?: string;
            limit?: number;
            sort?: 'created_at' | 'updated_at';
          }) => Promise<{
            success: boolean;
            count?: number;
            resources?: Array<{
              id: string;
              title: string;
              type: string;
              project_id: string;
              folder_id?: string | null;
              created_at: number;
              updated_at: number;
              metadata?: Record<string, any>;
            }>;
            error?: string;
          }>;
          resourceSemanticSearch: (
            query: string,
            options?: {
              project_id?: string;
              limit?: number;
            }
          ) => Promise<{
            success: boolean;
            query?: string;
            method?: 'semantic' | 'fts';
            count?: number;
            results?: Array<{
              id: string;
              title: string;
              type: string;
              project_id: string;
              similarity?: number;
              snippet: string;
              created_at: number;
              updated_at: number;
              metadata?: Record<string, any>;
              node_id?: string;
              pages?: number[];
              page_range?: string;
              node_title?: string;
              node_path?: string[];
            }>;
            error?: string;
          }>;
          projectList: () => Promise<{
            success: boolean;
            count?: number;
            projects?: Array<{
              id: string;
              name: string;
              description?: string;
              parent_id?: string;
              created_at: number;
              updated_at: number;
            }>;
            error?: string;
          }>;
          projectGet: (projectId: string) => Promise<{
            success: boolean;
            project?: {
              id: string;
              name: string;
              description?: string;
              parent_id?: string;
              created_at: number;
              updated_at: number;
              resource_count?: number;
            };
            error?: string;
          }>;
          interactionList: (
            resourceId: string,
            options?: {
              type?: 'annotation' | 'chat';
              limit?: number;
            }
          ) => Promise<{
            success: boolean;
            resource_id?: string;
            count?: number;
            interactions?: Array<{
              id: string;
              type: string;
              content: string;
              position_data?: any;
              metadata?: any;
              created_at: number;
              updated_at: number;
            }>;
            error?: string;
          }>;
          getRecentResources: (limit?: number) => Promise<{
            success: boolean;
            resources?: Array<{
              id: string;
              title: string;
              type: string;
              project_id: string;
              updated_at: number;
            }>;
            error?: string;
          }>;
          getCurrentProject: () => Promise<{
            success: boolean;
            project?: {
              id: string;
              name: string;
              description?: string;
            } | null;
            error?: string;
          }>;
          getLibraryOverview: (options?: {
            project_id?: string;
          }) => Promise<{
            success: boolean;
            project?: { id: string; name: string };
            root?: {
              resources: Array<{ id: string; title: string; type: string }>;
              folders: Array<{
                id: string;
                title: string;
                resource_count: number;
                subfolder_count: number;
              }>;
            };
            folders?: Array<{
              id: string;
              title: string;
              path: string;
              resources: Array<{ id: string; title: string; type: string }>;
              subfolders: Array<{ id: string; title: string }>;
            }>;
            total_resources?: number;
            total_folders?: number;
            error?: string;
          }>;
          resourceCreate: (data: {
            title: string;
            type?: string;
            content?: string;
            project_id?: string;
          }) => Promise<{
            success: boolean;
            resource?: {
              id: string;
              title: string;
              type: string;
              project_id: string;
              created_at: number;
              updated_at: number;
            };
            error?: string;
          }>;
          resourceUpdate: (
            resourceId: string,
            updates: {
              title?: string;
              content?: string;
              metadata?: Record<string, any>;
            }
          ) => Promise<{
            success: boolean;
            resource?: {
              id: string;
              title: string;
              type: string;
              updated_at: number;
            };
            error?: string;
          }>;
          resourceDelete: (resourceId: string) => Promise<{
            success: boolean;
            deleted?: {
              id: string;
              title: string;
            };
            error?: string;
          }>;
          resourceMoveToFolder: (
            resourceId: string,
            folderId: string | null
          ) => Promise<{
            success: boolean;
            resource_id?: string;
            folder_id?: string | null;
            error?: string;
          }>;
          importFileToLibrary: (args: {
            title: string;
            content?: string;
            content_base64?: string;
            mime_type?: string;
            filename?: string;
            project_id?: string;
            folder_id?: string | null;
          }) => Promise<{
            success: boolean;
            resource?: Resource;
            error?: string;
            duplicate?: { id: string; title: string };
          }>;
          flashcardCreate: (data: {
            resource_id?: string;
            source_ids?: string[];
            project_id: string;
            title: string;
            description?: string;
            cards: Array<{
              question: string;
              answer: string;
              difficulty?: string;
              tags?: string;
            }>;
          }) => Promise<{
            success: boolean;
            deck?: {
              id: string;
              title: string;
              card_count: number;
            };
            error?: string;
          }>;
          excelGet: (
            resourceId: string,
            options?: { sheet_name?: string; range?: string }
          ) => Promise<{ success: boolean; data?: unknown; sheet_names?: string[]; error?: string }>;
          excelGetFilePath: (
            resourceId: string
          ) => Promise<{ success: boolean; file_path?: string; resource_id?: string; title?: string; error?: string }>;
          excelSetCell: (
            resourceId: string,
            sheetName: string | undefined,
            cell: string,
            value: string | number | boolean
          ) => Promise<{ success: boolean; error?: string }>;
          excelSetRange: (
            resourceId: string,
            sheetName: string | undefined,
            range: string,
            values: (string | number | boolean | null)[][]
          ) => Promise<{ success: boolean; error?: string }>;
          excelAddRow: (
            resourceId: string,
            sheetName: string | undefined,
            values: (string | number | boolean | null)[],
            afterRow?: number
          ) => Promise<{ success: boolean; error?: string }>;
          excelAddSheet: (
            resourceId: string,
            sheetName: string,
            data?: (string | number | boolean | null)[][]
          ) => Promise<{ success: boolean; error?: string }>;
          excelCreate: (
            projectId: string,
            title: string,
            options?: { sheet_name?: string; initial_data?: (string | number | boolean | null)[][] }
          ) => Promise<{
            success: boolean;
            resource?: { id: string; title: string; type: string; project_id: string };
            error?: string;
          }>;
          excelExport: (
            resourceId: string,
            options?: { format?: string; sheet_name?: string }
          ) => Promise<{ success: boolean; data?: string; format?: string; error?: string }>;
          pptCreate: (
            projectId: string,
            title: string,
            spec?: { title?: string; slides?: Array<Record<string, unknown>> },
            options?: { folder_id?: string }
          ) => Promise<{
            success: boolean;
            resource?: { id: string; title: string; type: string; project_id: string };
            error?: string;
          }>;
          pptGetFilePath: (
            resourceId: string
          ) => Promise<{ success: boolean; file_path?: string; resource_id?: string; title?: string; error?: string }>;
          pptGetSlides: (
            resourceId: string
          ) => Promise<{ success: boolean; slides?: Array<{ index: number; text: string }>; error?: string }>;
          pptExport: (
            resourceId: string,
            options?: Record<string, unknown>
          ) => Promise<{ success: boolean; data?: string; format?: string; error?: string }>;
          pptGetSlideImages: (
            resourceId: string
          ) => Promise<{ success: boolean; slides?: Array<{ index: number; image_base64: string }>; error?: string }>;
          pdfExtractText: (
            resourceId: string,
            options?: { maxChars?: number; pages?: string },
          ) => Promise<{
            success: boolean;
            title?: string;
            text?: string;
            pages?: unknown;
            totalPages?: number;
            error?: string;
          }>;
          pdfGetMetadata: (resourceId: string) => Promise<{
            success: boolean;
            title?: string;
            metadata?: Record<string, unknown>;
            error?: string;
          }>;
          pdfGetStructure: (resourceId: string) => Promise<{
            success: boolean;
            title?: string;
            structure?: unknown;
            totalPages?: number;
            error?: string;
          }>;
          pdfSummarize: (
            resourceId: string,
            options?: { maxChars?: number; prompt?: string },
          ) => Promise<{
            success: boolean;
            title?: string;
            text?: string;
            metadata?: unknown;
            totalPages?: number;
            extractedPages?: unknown;
            prompt?: string;
            error?: string;
          }>;
          pdfExtractTables: (resourceId: string) => Promise<{
            success: boolean;
            title?: string;
            tables?: unknown;
            count?: number;
            error?: string;
          }>;
        };
      };

      // Audio API (TTS)
      audio: {
        generateSpeech: (
          text: string,
          voice?: string,
          options?: { model?: string; response_format?: string; speed?: number }
        ) => Promise<{
          success: boolean;
          audioPath?: string;
          size?: number;
          error?: string;
        }>;
        playFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        generatePodcast: (
          lines: Array<{ speaker: string; text: string }>,
          options?: {
            model?: string;
            voices?: Record<string, string>;
          }
        ) => Promise<{
          success: boolean;
          audioPath?: string;
          duration?: number;
          transcript?: Array<{ speaker: string; text: string; startTime: number }>;
          generationId?: string;
          error?: string;
        }>;
        getStatus: (generationId: string) => Promise<{
          success: boolean;
          data?: {
            status: string;
            progress?: number;
            total?: number;
            error?: string;
          } | null;
          error?: string;
        }>;
        list: () => Promise<{
          success: boolean;
          data?: Array<{
            filename: string;
            path: string;
            size: number;
            created: number;
          }>;
          error?: string;
        }>;
        onGenerationProgress: (callback: (data: { current: number; total: number }) => void) => RemoveListenerFn;
        stopStreamingTts: (runId: string) => Promise<{ success: boolean; error?: string }>;
        onTtsSentencePlaying: (callback: (data: { runId: string; sentence: string }) => void) => RemoveListenerFn;
        onTtsFinished: (callback: (data: { runId: string }) => void) => RemoveListenerFn;
        onTtsError: (callback: (data: { runId: string; error: string }) => void) => RemoveListenerFn;
      };

      transcription: {
        requestMicrophoneAccess: () => Promise<{
          success: boolean;
          granted?: boolean;
          error?: string;
        }>;
        resourceToNote: (args: {
          resourceId: string;
          title?: string;
          language?: string | null;
          model?: string;
          updateAudioMetadata?: boolean;
        }) => Promise<{
          success: boolean;
          note?: import('./index').Resource;
          text?: string;
          structured?: import('./index').StructuredTranscriptPayload;
          sourceResourceId?: string;
          error?: string;
        }>;
        bufferToNote: (args: {
          buffer: ArrayBuffer;
          extension?: string;
          projectId?: string;
          folderId?: string | null;
          title?: string;
          audioTitle?: string;
          saveRecordingAsAudio?: boolean;
          language?: string | null;
          model?: string;
          captureKind?: 'microphone' | 'system' | 'call';
          callPlatform?: string;
        }) => Promise<{
          success: boolean;
          note?: import('./index').Resource;
          text?: string;
          structured?: import('./index').StructuredTranscriptPayload;
          audioResourceId?: string | null;
          error?: string;
        }>;
        bufferToText: (args: {
          buffer: ArrayBuffer;
          extension?: string;
          language?: string | null;
          model?: string;
        }) => Promise<{
          success: boolean;
          text?: string;
          structured?: import('./index').StructuredTranscriptPayload | null;
          error?: string;
        }>;
        getDefaults: () => Promise<{
          success: boolean;
          data?: {
            sttProvider?: 'openai' | 'groq' | 'custom';
            model: string;
            language: string | null;
            apiBaseUrl?: string;
            prompt?: string;
            pauseThresholdSec?: number;
          };
          error?: string;
        }>;
        getSettings: () => Promise<{
          success: boolean;
          data?: {
            sttProvider: 'openai' | 'groq' | 'custom';
            model: string;
            language: string | null;
            apiBaseUrl: string;
            prompt: string;
            hasDedicatedOpenAIKey: boolean;
            hasGroqApiKey: boolean;
            globalShortcut: string;
            manyVoiceGlobalShortcut?: string;
            transcriptionGlobalShortcutEnabled?: boolean;
            manyVoiceGlobalShortcutEnabled?: boolean;
            manyVoiceRealtimeEnabled?: boolean;
            realtimeVoice?: string;
            realtimeModel?: string;
            realtimeInstructionsSuffix?: string;
            pauseThresholdSec?: number;
          };
          error?: string;
        }>;
        setSettings: (args: {
          sttProvider?: 'openai' | 'groq' | 'custom';
          model?: string;
          language?: string | null;
          dedicatedOpenaiKey?: string | null;
          groqApiKey?: string | null;
          globalShortcut?: string;
          manyVoiceGlobalShortcut?: string;
          transcriptionGlobalShortcutEnabled?: boolean;
          manyVoiceGlobalShortcutEnabled?: boolean;
          manyVoiceRealtimeEnabled?: boolean;
          realtimeVoice?: string;
          realtimeModel?: string;
          realtimeInstructionsSuffix?: string;
          apiBaseUrl?: string;
          prompt?: string | null;
          pauseThresholdSec?: number | string | null;
        }) => Promise<{ success: boolean; error?: string }>;
        regenerateLinkedNote: (args: { resourceId: string }) => Promise<{
          success: boolean;
          noteId?: string;
          error?: string;
        }>;
        patchTranscriptSpeakers: (args: {
          resourceId: string;
          speakersPatch: Record<string, { label: string; isSelf?: boolean }>;
        }) => Promise<{ success: boolean; error?: string }>;
        listDesktopCaptureSources: () => Promise<{
          success: boolean;
          sources?: Array<{ id: string; name: string }>;
          error?: string;
          errorCode?: 'screen_capture_permission';
        }>;
        setDisplayMediaSource: (sourceId: string) => Promise<{ success: boolean; error?: string }>;
        getPermissionsStatus: () => Promise<{
          success: boolean;
          microphone?: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
          screen?: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
          error?: string;
        }>;
        requestScreenAccess: () => Promise<{
          success: boolean;
          screen?: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
          error?: string;
        }>;
        onToggleRecording: (callback: () => void) => RemoveListenerFn;
      };

      transcriptionOverlay: {
        toggleFromUi: () => Promise<{ success: boolean; error?: string }>;
        overlaySetVisible: (visible: boolean) => Promise<{ success: boolean; error?: string }>;
        overlayResize: (height: number) => Promise<{ success: boolean; error?: string }>;
        openNoteInMain: (payload: { noteId: string; title?: string }) => Promise<{ success: boolean; error?: string }>;
        onOverlayLoaded: (callback: () => void) => RemoveListenerFn;
      };

      manyVoice: {
        onToggle: (callback: () => void) => RemoveListenerFn;
        onPttStart?: (callback: () => void) => RemoveListenerFn;
        onPttEnd?: (callback: () => void) => RemoveListenerFn;
        relaySend: (args: {
          text: string;
          autoSpeak?: boolean;
          openPanel?: boolean;
          voiceLanguage?: string;
        }) => Promise<{ success: boolean; error?: string }>;
        pushStateToOverlay: (payload: {
          status: 'idle' | 'thinking' | 'speaking' | 'listening';
          ttsError?: string | null;
          currentSentence?: string | null;
        }) => Promise<{ success: boolean; error?: string }>;
        overlayMounted: () => Promise<{ success: boolean; error?: string }>;
        overlaySetVisible: (visible: boolean) => Promise<{ success: boolean; error?: string }>;
        openManyPanel: () => Promise<{ success: boolean; error?: string }>;
        dismissTtsError: () => Promise<{ success: boolean; error?: string }>;
        overlayResize: (height: number) => Promise<{ success: boolean; error?: string }>;
        toggleOverlayFromUi: () => Promise<{ success: boolean; error?: string }>;
        onRelayToMain: (
          callback: (payload: { text: string; autoSpeak?: boolean; openPanel?: boolean; voiceLanguage?: string }) => void
        ) => RemoveListenerFn;
        onHudState: (
          callback: (payload: {
            status?: 'idle' | 'thinking' | 'speaking' | 'listening';
            ttsError?: string | null;
            currentSentence?: string | null;
          }) => void,
        ) => RemoveListenerFn;
        onRequestStatePush: (callback: () => void) => RemoveListenerFn;
        onOpenPanelRequest: (callback: () => void) => RemoveListenerFn;
        onDismissTtsError: (callback: () => void) => RemoveListenerFn;
        onOverlayLoaded: (callback: () => void) => RemoveListenerFn;
      };

      // Realtime Voice API (OpenAI STS)
      realtime?: {
        getSessionConfig: () => Promise<
          | { success: true; voice: string; model: string; instructionsSuffix?: string }
          | { success: false; error: string }
        >;
        createEphemeralToken: (params: { model: string; voice: string }) => Promise<
          | { success: true; clientSecret: string }
          | { success: false; error: string }
        >;
        exchangeSdp: (params: { sdp: string; sessionConfig: Record<string, unknown> }) => Promise<
          | { success: true; sdp: string }
          | { success: false; error: string }
        >;
        executeTool: (params: { name: string; args: Record<string, unknown> }) => Promise<
          | { success: true; output: string }
          | { success: false; error: string }
        >;
      };

      // Ollama API
      ollama: {
        checkAvailability: () => Promise<{
          success: boolean;
          available?: boolean;
          error?: string;
        }>;
        listModels: () => Promise<{
          success: boolean;
          models?: Array<{ name: string; size: number; modified_at: string }>;
          error?: string;
        }>;
        generateEmbedding: (text: string) => Promise<{
          success: boolean;
          embedding?: number[];
          error?: string;
        }>;
        generateSummary: (text: string) => Promise<{
          success: boolean;
          summary?: string;
          error?: string;
        }>;
        chat: (
          messages: Array<{ role: string; content: string }>,
          model?: string
        ) => Promise<{
          success: boolean;
          content?: string;
          error?: string;
        }>;
        // Native Ollama Manager (binary management and lifecycle)
        manager: {
          start: (version?: string) => Promise<{
            success: boolean;
            message?: string;
            error?: string;
          }>;
          stop: () => Promise<{
            success: boolean;
            message?: string;
            error?: string;
          }>;
          status: () => Promise<{
            success: boolean;
            status?: 'stopped' | 'starting' | 'downloading' | 'running' | 'error';
            version?: string | null;
            downloadProgress?: number;
            error?: string | null;
            isRunning?: boolean;
          }>;
          download: (version?: string) => Promise<{
            success: boolean;
            message?: string;
            error?: string;
          }>;
          versions: () => Promise<{
            success: boolean;
            versions?: string[];
            error?: string;
          }>;
          onDownloadProgress: (callback: (data: { percent: number; status: string }) => void) => RemoveListenerFn;
          onServerLog: (callback: (message: string) => void) => RemoveListenerFn;
          onStatusChanged: (callback: (status: { status: string; version?: string; error?: string }) => void) => RemoveListenerFn;
        };
      };

      // Vector Database API - Annotations and Resources
      vector: {
        // Add embeddings to vector database
        add: (embeddings: any[]) => Promise<{
          success: boolean;
          data?: any;
          error?: string;
        }>;
        // Generic search across all embeddings (text-based or vector-based)
        search: (query: string | {
          vector: number[];
          limit?: number;
          filter?: string;
          threshold?: number;
        }, options?: {
          limit?: number;
          threshold?: number;
          filter?: Record<string, any>;
        }) => Promise<{
          success: boolean;
          data?: Array<{
            id: string;
            resource_id?: string;
            text: string;
            score: number;
            _distance?: number;
            metadata: any;
          }>;
          error?: string;
        }>;
        // Delete embeddings by filter
        delete: (filter: string) => Promise<{
          success: boolean;
          error?: string;
        }>;
        // Annotation-specific operations
        annotations: {
          index: (annotationData: {
            annotationId: string;
            resourceId: string;
            text: string;
            metadata: {
              annotation_type: 'highlight' | 'note';
              page_index: number;
              resource_type: 'pdf';
              title: string;
              project_id: string;
            };
          }) => Promise<{ success: boolean; error?: string }>;
          search: (queryData: {
            queryText?: string;
            queryVector?: number[];
            limit?: number;
            resourceId?: string;
          }) => Promise<{
            success: boolean;
            data?: Array<{
              annotationId: string;
              resourceId: string;
              text: string;
              score: number;
              metadata: any;
            }>;
            error?: string;
          }>;
          delete: (annotationId: string) => Promise<{ success: boolean; error?: string }>;
        };
        status: () => Promise<{ available: boolean; path: string | null }>;
        resources: {
          index: (payload: { resourceId?: string; resourceIds?: string[] } | string[]) => Promise<{ success: boolean; chunksIndexed?: number; error?: string }>;
          addEmbeddings: (embeddings: Array<{
            id: string;
            resource_id: string;
            chunk_index?: number;
            text: string;
            vector: number[];
            metadata?: { resource_type?: string; title?: string; project_id?: string; projectId?: string; created_at?: number };
          }>) => Promise<{ success: boolean; count?: number; error?: string }>;
          stats: () => Promise<{
            success: boolean;
            chunks?: number;
            resourcesIndexed?: number;
            tableNames?: string[];
            lastError?: string | null;
          }>;
          reindexAll: () => Promise<{ success: boolean; chunksIndexed?: number; resourcesProcessed?: number; error?: string }>;
          repair: () => Promise<{ success: boolean; error?: string }>;
        };
      };

      // Notebook API (Python via IPC - Electron only)
      notebook: {
        runPython: (code: string, options?: { cells?: string[]; targetCellIndex?: number; currentCellCode?: string; cwd?: string; venvPath?: string; timeoutMs?: number }) => Promise<{
          success: boolean;
          outputs: Array<{
            output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
            name?: 'stdout' | 'stderr';
            text?: string | string[];
            data?: Record<string, string | string[]>;
            ename?: string;
            evalue?: string;
            traceback?: string[];
          }>;
          error?: string;
        }>;
        checkPython: () => Promise<{
          available: boolean;
          version?: string;
          path?: string;
        }>;
        createVenv: (basePath: string) => Promise<{ success: boolean; venvPath?: string; error?: string }>;
        pipInstall: (venvPath: string, packages: string[]) => Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>;
        checkVenv: (venvPath: string) => Promise<{ valid: boolean; error?: string }>;
        pipList: (venvPath: string) => Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>;
        pipInstallFromRequirements: (venvPath: string, requirementsPath: string) => Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>;
      };

      // Personality / Memory API
      personality: {
        getPrompt: (params?: Record<string, unknown>) => Promise<{ success: boolean; data?: string; error?: string }>;
        readFile: (filename: string) => Promise<{ success: boolean; data?: string; error?: string }>;
        writeFile: (filename: string, content: string) => Promise<{ success: boolean; error?: string }>;
        addMemory: (entry: string) => Promise<{ success: boolean; error?: string }>;
        listFiles: () => Promise<{ success: boolean; data?: string[]; error?: string }>;
        rememberFact: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
      };

      // Cloud Storage API (Google Drive)
      cloud: {
        getAccounts: () => Promise<{
          success: boolean;
          accounts?: Array<{ provider: 'google'; accountId: string; email: string; connected: boolean }>;
          error?: string;
        }>;
        authGoogle: () => Promise<{ success: boolean; message?: string; error?: string }>;
        disconnect: (accountId: string) => Promise<{ success: boolean; error?: string }>;
        listFiles: (params: {
          accountId: string;
          folderId?: string | null;
          query?: string;
        }) => Promise<{
          success: boolean;
          files?: Array<{
            id: string;
            name: string;
            mimeType: string | null;
            size: number | null;
            modifiedAt: string | null;
            isFolder: boolean;
            provider: string;
            accountId: string;
          }>;
          error?: string;
        }>;
        importFile: (params: {
          accountId: string;
          fileId: string;
          fileName?: string;
          mimeType?: string | null;
          projectId?: string;
          folderId?: string | null;
        }) => Promise<{ success: boolean; resource?: Resource; error?: string; duplicate?: { id: string; title: string } }>;
        onAuthResult: (callback: (data: { success: boolean; provider: string; email?: string; accountId?: string; error?: string }) => void) => RemoveListenerFn;
      };
    };
  }
}

// CSS Modules
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

