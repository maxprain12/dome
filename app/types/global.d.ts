export { };

// Raw text imports for prompts
declare module '*.txt?raw' {
  const content: string;
  export default content;
}

// Tiptap custom commands declaration
import type { CalloutBlockAttributes, DividerAttributes, ToggleBlockAttributes, PDFEmbedAttributes, FileBlockAttributes, VideoEmbedAttributes, AudioEmbedAttributes } from '@/types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attributes?: CalloutBlockAttributes) => ReturnType;
    };
    divider: {
      setDivider: (attributes?: DividerAttributes) => ReturnType;
    };
    toggle: {
      setToggle: (attributes?: ToggleBlockAttributes) => ReturnType;
    };
    pdfEmbed: {
      setPDFEmbed: (attributes: PDFEmbedAttributes) => ReturnType;
    };
    fileBlock: {
      setFileBlock: (attributes: FileBlockAttributes) => ReturnType;
    };
    mermaid: {
      setMermaid: (attributes?: { code?: string }) => ReturnType;
    };
    videoEmbed: {
      setVideoEmbed: (attributes: VideoEmbedAttributes) => ReturnType;
    };
    audioEmbed: {
      setAudioEmbed: (attributes: AudioEmbedAttributes) => ReturnType;
    };
  }
}

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

interface Resource {
  id: string;
  project_id: string;
  type: 'note' | 'pdf' | 'video' | 'audio' | 'image' | 'url' | 'document' | 'folder' | 'notebook';
  title: string;
  content?: string;
  // Legacy external file path (deprecated)
  file_path?: string;
  // Internal file storage (new system)
  internal_path?: string;
  file_mime_type?: string;
  file_size?: number;
  file_hash?: string;
  thumbnail_data?: string;
  original_filename?: string;
  // Folder containment
  folder_id?: string | null;
  metadata?: Record<string, any>;
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

type InteractionType = 'note' | 'annotation' | 'chat';

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

      // Theme
      getTheme: () => Promise<'light' | 'dark'>;
      setTheme: (theme: 'light' | 'dark' | 'auto') => Promise<'light' | 'dark'>;
      onThemeChanged: (callback: ThemeChangeCallback) => RemoveListenerFn;

      // User Settings
      selectAvatar: () => Promise<string | null>;
      openSettings: () => Promise<{ success: boolean; windowId?: string; error?: string }>;

      // Avatar management
      avatar: {
        copyFile: (sourcePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      };

      // IPC Communication
      invoke: (channel: string, ...args: any[]) => Promise<any>;
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

      // Database API
      db: {
        projects: {
          create: (project: any) => Promise<DBResponse<Project>>;
          getAll: () => Promise<DBResponse<Project[]>>;
          getById: (id: string) => Promise<DBResponse<Project>>;
        };
        resources: {
          create: (resource: any) => Promise<DBResponse<Resource>>;
          getByProject: (projectId: string) => Promise<DBResponse<Resource[]>>;
          getById: (id: string) => Promise<DBResponse<Resource>>;
          update: (resource: any) => Promise<DBResponse<Resource>>;
          search: (query: string) => Promise<DBResponse<Resource[]>>;
          getAll: (limit?: number) => Promise<DBResponse<Resource[]>>;
          delete: (id: string) => Promise<DBResponse<void>>;
          // Folder containment
          getByFolder: (folderId: string) => Promise<DBResponse<Resource[]>>;
          getRoot: (projectId?: string) => Promise<DBResponse<Resource[]>>;
          moveToFolder: (resourceId: string, folderId: string | null) => Promise<DBResponse<void>>;
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
        tags: {
          getByResource: (resourceId: string) => Promise<DBResponse<Array<{ id: string; name: string; color?: string }>>>;
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
        open: (resourceId: string, resourceType: string) => Promise<{
          success: boolean;
          data?: { windowId: string; resourceId: string; title: string };
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
        readDocumentContent: (resourceId: string) => Promise<{
          success: boolean;
          data?: string;
          mimeType?: string;
          filename?: string;
          error?: string;
        }>;
        export: (
          resourceId: string,
          destinationPath: string
        ) => Promise<DBResponse<string>>;
        delete: (resourceId: string) => Promise<DBResponse<void>>;
        regenerateThumbnail: (resourceId: string) => Promise<DBResponse<string>>;
        setThumbnail: (resourceId: string, thumbnailDataUrl: string) => Promise<DBResponse<void>>;
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
      };

      // Web Scraping API
      web: {
        scrape: (url: string) => Promise<{
          success: boolean;
          url: string;
          title?: string | null;
          content?: string | null;
          metadata?: any;
          screenshot?: string | null;
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

      // AI Cloud API (OpenAI, Anthropic, Google)
      ai: {
        chat: (
          provider: 'openai' | 'anthropic' | 'google',
          messages: Array<{ role: string; content: string }>,
          model?: string
        ) => Promise<{
          success: boolean;
          content?: string;
          error?: string;
        }>;
        stream: (
          provider: 'openai' | 'anthropic' | 'google' | 'ollama',
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
        onStreamChunk: (callback: (data: {
          streamId: string;
          type: 'text' | 'tool_call' | 'done' | 'error';
          text?: string;
          error?: string;
          toolCall?: {
            id: string;
            name: string;
            arguments: string;
          };
        }) => void) => RemoveListenerFn;
        embeddings: (
          provider: 'openai' | 'google',
          texts: string[],
          model?: string
        ) => Promise<{
          success: boolean;
          embeddings?: number[][];
          error?: string;
        }>;
        checkClaudeMaxProxy: () => Promise<{
          success: boolean;
          available?: boolean;
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
              type?: 'note' | 'annotation' | 'chat';
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
          flashcardCreate: (data: {
            resource_id?: string;
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
      };

      // Notebook API (Python via IPC - Electron only)
      notebook: {
        runPython: (code: string, options?: { cells?: string[]; targetCellIndex?: number; currentCellCode?: string }) => Promise<{
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
      };
    };
  }
}
