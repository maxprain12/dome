// Persistence contracts (collab-ready) - see contracts.ts
export type {
  NotePersistencePayload,
  NoteHistorySnapshot,
  NoteLinkPayload,
} from './contracts';

export interface MCPToolConfig {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  inputSchema?: Record<string, unknown>;
}

export interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled?: boolean;
  tools?: MCPToolConfig[];
  enabledToolIds?: string[];
  lastDiscoveryAt?: number;
  lastDiscoveryError?: string | null;
}

/** Folder for organizing many_agents in the Agents hub */
export interface DomeAgentFolder {
  id: string;
  /** Workspace project (default: Dome) */
  projectId?: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** Folder for organizing canvas workflows */
export interface DomeWorkflowFolder {
  id: string;
  projectId?: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// Many Agent (specialized AI agent - "hijo de Many")
export interface ManyAgent {
  id: string;
  /** Owning workspace project */
  projectId?: string;
  name: string;
  description: string;
  systemInstructions: string;
  toolIds: string[];
  mcpServerIds: string[];
  skillIds: string[];
  iconIndex: number; // 1-18 for agents/sprite_N.png
  /** Set when installed from marketplace; used to sync uninstall state */
  marketplaceId?: string;
  /** Agent library folder (null/undefined = root) */
  folderId?: string | null;
  /** Pinned at top of the list */
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

// Marketplace Agent — community/team-curated agent with authorship
export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  systemInstructions: string;
  toolIds: string[];
  mcpServerIds: string[];
  skillIds: string[];
  iconIndex: number;
  author: string;
  authorAvatarUrl?: string;
  version: string;
  tags: string[];
  featured: boolean;
  downloads: number;
  createdAt: number;
  source?: 'official' | 'community';
  capabilities?: string[];
  resourceAffinity?: string[];
  compatibility?: {
    minAppVersion?: string;
    minSchemaVersion?: number;
  };
}

// Agent Team — supervisor-coordinated team of specialized agents
export interface AgentTeam {
  id: string;
  name: string;
  description: string;
  supervisorInstructions: string;
  memberAgentIds: string[];
  toolIds?: string[];
  mcpServerIds?: string[];
  capabilities?: string[];
  iconIndex: number;
  createdAt: number;
  updatedAt: number;
}

// Tipos de recursos
export type ResourceType =
  | 'pdf'
  | 'video'
  | 'audio'
  | 'image'
  | 'url'
  | 'folder'
  | 'notebook'
  | 'excel'
  | 'ppt'
  | 'note'
  | 'document';

export interface Resource {
  id: string;
  project_id: string;
  type: ResourceType;
  title: string;
  content?: string;

  // Legacy external file path (deprecated, for migration)
  file_path?: string;

  // Internal file storage (new system)
  /** Relative path within dome-files: "images/hash.png" */
  internal_path?: string;
  /** MIME type of the file */
  file_mime_type?: string;
  /** File size in bytes */
  file_size?: number;
  /** SHA-256 hash (first 16 chars) for deduplication */
  file_hash?: string;
  /** Base64 data URL for thumbnail (fast preview in lists) */
  thumbnail_data?: string;
  /** Original filename when imported */
  original_filename?: string;

  // Folder containment
  /** ID of the folder this resource is in (null if at root) */
  folder_id?: string | null;

  metadata?: ResourceMetadata;
  /** Set by main process when URL/YouTube thumbnail fetch completes */
  thumbnail_ready?: boolean;
  created_at: number;
  updated_at: number;
}

/** Segmento de transcripción con timestamp y hablante (UI + notas enriquecidas) */
export interface TranscriptionSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  /** Identificador estable del hablante (ej. auto-0, user-named) */
  speakerId: string;
  /** Etiqueta mostrada; puede sobrescribir el mapa speakers */
  speakerLabel?: string;
  confidence?: number;
}

/** Perfil de hablante para una transcripción concreta */
export interface TranscriptionSpeakerProfile {
  label: string;
  /** Si true, marca al usuario local (p. ej. micrófono) */
  isSelf?: boolean;
  colorIndex?: number;
}

export type TranscriptionCaptureKind = 'file' | 'microphone' | 'system' | 'call';

export type TranscriptionCallPlatform =
  | 'teams'
  | 'slack'
  | 'discord'
  | 'meet'
  | 'zoom'
  | 'webex'
  | 'unknown';

export type TranscriptionDiarizationStatus =
  | 'none'
  | 'heuristic'
  | 'model'
  | 'manual';

/**
 * Blob versionado guardado en metadata del recurso multimedia.
 * Futuro: `diarization: 'model'` cuando exista un motor de diarización real (p. ej. por voz),
 * sin romper este esquema; el campo `speakers` ya soporta IDs estables y renombrado manual.
 */
export interface StructuredTranscriptPayload {
  version: 1;
  segments: TranscriptionSegment[];
  speakers: Record<string, TranscriptionSpeakerProfile>;
  session?: {
    captureKind: TranscriptionCaptureKind;
    callPlatform: TranscriptionCallPlatform;
    /** ISO o timestamp ms cuando se infirió la plataforma */
    inferredAt?: number;
  };
  diarization: TranscriptionDiarizationStatus;
  /** Duración conocida del medio (s), si está disponible */
  durationSec?: number;
}

/**
 * Convenciones para KB LLM (wiki compilada por agentes).
 * Ver docs/kb-llm-wiki-model.md y docs/kb-index-policy.md.
 */
export interface DomeKbMetadata {
  wikiRole?: 'raw' | 'compiled' | 'index' | 'output';
  /** Si es true, cada guardado puede programar reindex PageIndex (debounced) en el main process. */
  reindexOnSave?: boolean;
  topicId?: string;
  pipelineVersion?: string;
}

export interface ResourceMetadata {
  file_size?: number;
  file_hash?: string;
  duration?: number; // Para videos/audios
  page_count?: number; // Para PDFs
  url?: string; // Para recursos web
  thumbnail?: string;
  transcription?: string; // Para videos/audios — texto plano legacy / búsqueda
  /** Transcripción estructurada: timestamps, hablantes, sesión */
  transcription_structured?: StructuredTranscriptPayload;
  /** Nota principal generada desde transcripción (enlace bidireccional) */
  transcription_note_id?: string;
  /** Recurso de audio/video origen (en notas creadas desde transcripción) */
  source_audio_id?: string;
  source_media_type?: 'audio' | 'video';
  transcription_model?: string;
  transcription_language?: string;
  transcribed_at?: number;
  from_microphone?: boolean;
  source?: string;
  summary?: string; // Generado por IA
  // Para recursos URL:
  url_type?: 'article' | 'youtube';
  scraped_content?: string;
  embedding?: number[];
  /** Legacy: algunos flujos usaron 'done' en lugar de 'completed' */
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed' | 'done';
  processed_at?: number;
  screenshot_path?: string; // Path interno de la captura guardada
  video_id?: string; // Para YouTube
  channel?: string; // Para YouTube
  /** Notebook workspace folder path - used as cwd for Python execution */
  notebook_workspace_path?: string;
  /** Wiki / corpus KB mantenido por agentes (opcional) */
  dome_kb?: DomeKbMetadata;
  [key: string]: unknown;
}

// Tipos de proyectos
export interface Project {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  created_at: number;
  updated_at: number;
}

// Tipos de fuentes académicas
export type SourceType = 'article' | 'book' | 'website' | 'video' | 'podcast' | 'other';

export interface Source {
  id: string;
  resource_id?: string;
  type: SourceType;
  title: string;
  authors?: string;
  year?: number;
  doi?: string;
  url?: string;
  publisher?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  isbn?: string;
  metadata?: SourceMetadata;
  created_at: number;
  updated_at: number;
}

export interface SourceMetadata {
  abstract?: string;
  keywords?: string[];
  citation_count?: number;
  [key: string]: unknown;
}

// Tipos de citas
export interface Citation {
  id: string;
  source_id: string;
  resource_id: string;
  quote?: string;
  page_number?: string;
  notes?: string;
  created_at: number;
}

// Tipos de etiquetas
export interface Tag {
  id: string;
  name: string;
  color?: string;
  created_at: number;
}

// Tipos para búsqueda semántica
export interface SearchResult {
  resource: Resource;
  score: number;
  highlights?: string[];
}

export interface SemanticSearchResult {
  id: string;
  resource_id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

// Estilos de citación
export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard' | 'vancouver' | 'ieee';

// Tipos de providers de IA
export type AIProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'dome'
  | 'ollama'
  | 'synthetic'
  | 'venice'
  | 'copilot'
  | 'deepseek'
  | 'minimax'
  | 'moonshot'
  | 'qwen';

// Configuración de IA
export interface AISettings {
  provider: AIProviderType;
  api_key?: string;
  model?: string;
  embedding_model?: string;
  base_url?: string;
  // Para Ollama:
  ollama_base_url?: string;
  ollama_model?: string;
  ollama_api_key?: string;
  ollama_embedding_model?: string;
  ollama_temperature?: number;
  ollama_top_p?: number;
  ollama_num_predict?: number;
  /** Cuando true, modelos con "thinking" muestran el razonamiento interno. Por defecto false (solo respuesta final). */
  ollama_show_thinking?: boolean;
}

// Configuración general
export interface AppSettings {
  ai: AISettings;
  theme: 'light' | 'dark' | 'auto';
  default_citation_style: CitationStyle;
  auto_save: boolean;
  auto_backup: boolean;
}

// Perfil de usuario
export interface UserProfile {
  name: string;
  email: string;
  /** Base64 data URL for avatar (data:image/...) - Legacy, prefer avatarPath */
  avatarData?: string;
  /** Relative path to avatar file (e.g., "avatars/user-avatar-123.jpg") - New system */
  avatarPath?: string;
}

/** Acciones rápidas disponibles en el home (orden y visibilidad configurables) */
export type HomeQuickActionId =
  | 'newNote'
  | 'upload'
  | 'newChat'
  | 'learn'
  | 'calendar';

/** Widgets del dashboard gamificado del home */
export interface HomeDashboardWidgets {
  momentum: boolean;
  weeklyActivity: boolean;
  pendingToday: boolean;
  search: boolean;
  continueActivity: boolean;
}

/** Celda del grid del dashboard (react-grid-layout); `i` es el id del bloque */
export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

/** Orden e ids válidos del layout del home (hero siempre presente) */
export const DASHBOARD_LAYOUT_WIDGET_IDS = [
  'hero',
  'search',
  'quickActions',
  'momentum',
  'weeklyActivity',
  'pendingToday',
  'continueActivity',
] as const;

export type DashboardLayoutWidgetId = (typeof DASHBOARD_LAYOUT_WIDGET_IDS)[number];

export interface HomeDashboardPreferences {
  quickActions: HomeQuickActionId[];
  widgets: HomeDashboardWidgets;
  layout: DashboardLayoutItem[];
}

/** Valores por defecto del home dashboard */
export const DEFAULT_HOME_QUICK_ACTIONS: HomeQuickActionId[] = [
  'newNote',
  'upload',
  'newChat',
  'learn',
  'calendar',
];

export const DEFAULT_HOME_WIDGETS: HomeDashboardWidgets = {
  momentum: true,
  weeklyActivity: true,
  pendingToday: true,
  search: true,
  continueActivity: true,
};

/** Layout inicial del canvas (12 columnas; altura de fila definida en el componente) */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutItem[] = [
  { i: 'hero', x: 0, y: 0, w: 12, h: 10, minW: 6, minH: 6, static: true },
  { i: 'search', x: 0, y: 10, w: 12, h: 3, minW: 4, minH: 2 },
  { i: 'quickActions', x: 0, y: 13, w: 12, h: 5, minW: 4, minH: 3 },
  { i: 'momentum', x: 0, y: 18, w: 12, h: 5, minW: 4, minH: 4 },
  { i: 'weeklyActivity', x: 0, y: 23, w: 12, h: 8, minW: 4, minH: 5 },
  { i: 'pendingToday', x: 0, y: 31, w: 6, h: 8, minW: 3, minH: 4 },
  { i: 'continueActivity', x: 6, y: 31, w: 6, h: 9, minW: 3, minH: 5 },
];

export const DEFAULT_HOME_DASHBOARD_PREFERENCES: HomeDashboardPreferences = {
  quickActions: [...DEFAULT_HOME_QUICK_ACTIONS],
  widgets: { ...DEFAULT_HOME_WIDGETS },
  layout: DEFAULT_DASHBOARD_LAYOUT.map((item) => ({ ...item })),
};

// Preferencias de la aplicación
export interface AppPreferences {
  theme: 'light' | 'dark' | 'auto';
  autoSave: boolean;
  autoBackup: boolean;
  citationStyle: CitationStyle;
  shortcuts?: Record<string, string>;
  homeDashboard?: HomeDashboardPreferences;
}

// Tipos para el editor tipo Notion
export interface CalloutBlockAttributes {
  icon?: string;
  color?: string;
  variant?: 'info' | 'warning' | 'error' | 'success';
}

export interface ToggleBlockAttributes {
  collapsed?: boolean;
}

export interface PDFEmbedAttributes {
  resourceId: string;
  pageStart?: number;
  pageEnd?: number;
  zoom?: number;
}

export interface ResourceMentionAttributes {
  resourceId: string;
  title: string;
  type: ResourceType;
}

export interface FileBlockAttributes {
  resourceId: string;
  filename: string;
  mimeType?: string;
  size?: number;
}

export interface DividerAttributes {
  variant?: 'line' | 'dots' | 'space';
}

export interface VideoEmbedAttributes {
  src: string;
  provider?: 'youtube' | 'direct';
  videoId?: string;
}

export interface AudioEmbedAttributes {
  src: string;
  isLocal?: boolean;
}

// ============================================
// NOTEBOOK TYPES (nbformat 4.x)
// ============================================

export type NotebookCellType = 'code' | 'markdown' | 'raw';

export interface NotebookStreamOutput {
  output_type: 'stream';
  name: 'stdout' | 'stderr';
  text: string | string[];
}

export interface NotebookExecuteResultOutput {
  output_type: 'execute_result';
  execution_count: number;
  data: Record<string, string | string[]>;
  metadata?: Record<string, unknown>;
}

export interface NotebookDisplayDataOutput {
  output_type: 'display_data';
  data: Record<string, string | string[]>;
  metadata?: Record<string, unknown>;
}

export interface NotebookErrorOutput {
  output_type: 'error';
  ename: string;
  evalue: string;
  traceback?: string[];
}

export type NotebookOutput =
  | NotebookStreamOutput
  | NotebookExecuteResultOutput
  | NotebookDisplayDataOutput
  | NotebookErrorOutput;

export interface NotebookCellBase {
  cell_type: NotebookCellType;
  source: string | string[];
  metadata?: Record<string, unknown>;
}

export interface NotebookCodeCell extends NotebookCellBase {
  cell_type: 'code';
  outputs: NotebookOutput[];
  execution_count: number | null;
}

export interface NotebookMarkdownCell extends NotebookCellBase {
  cell_type: 'markdown';
}

export type NotebookCell = NotebookCodeCell | NotebookMarkdownCell;

export interface NotebookMetadata {
  kernelspec?: {
    display_name?: string;
    name?: string;
    language?: string;
  };
  [key: string]: unknown;
}

export interface NotebookContent {
  nbformat: number;
  nbformat_minor: number;
  cells: NotebookCell[];
  metadata: NotebookMetadata;
}

// ============================================
// AUTH TYPES
// ============================================

export type AuthProfileType = 'api_key' | 'oauth' | 'token';

export interface AuthProfile {
  id: string;
  provider: AIProviderType;
  type: AuthProfileType;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// WHATSAPP TYPES
// ============================================

export type WhatsAppConnectionState = 'connected' | 'disconnected' | 'pending';

export type WhatsAppMessageType = 'text' | 'audio' | 'image' | 'document' | 'video' | 'location';

export interface WhatsAppStatus {
  isRunning: boolean;
  state: WhatsAppConnectionState;
  qrCode: string | null;
  selfId: string | null;
  hasAuth: boolean;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  type: WhatsAppMessageType;
  content?: string;
  mediaPath?: string;
  processed: boolean;
  resourceId?: string;
  createdAt: number;
}

// ============================================
// MARTIN TYPES
// ============================================

// ============================================
// FLASHCARD TYPES
// ============================================

export interface FlashcardDeck {
  id: string;
  resource_id?: string;
  project_id: string;
  title: string;
  description?: string;
  card_count: number;
  tags?: string;
  settings?: string;
  created_at: number;
  updated_at: number;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags?: string;
  metadata?: string;
  ease_factor: number;
  interval: number;
  repetitions: number;
  next_review_at: number | null;
  last_reviewed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface FlashcardStudySession {
  id: string;
  deck_id: string;
  cards_studied: number;
  cards_correct: number;
  cards_incorrect: number;
  duration_ms: number;
  started_at: number;
  completed_at: number | null;
}

export interface FlashcardDeckStats {
  total: number;
  new_cards: number;
  due_cards: number;
  mastered_cards: number;
}

// ============================================
// DEEP RESEARCH TYPES
// ============================================

export interface ResearchPlan {
  topic: string;
  subtopics: Array<{
    id: string;
    title: string;
    status: 'pending' | 'searching' | 'analyzing' | 'done';
    queries?: string[];
  }>;
}

export interface ResearchReport {
  title: string;
  sections: Array<{
    id: string;
    heading: string;
    content: string;
  }>;
  sources: Array<{
    id: string;
    title: string;
    url?: string;
    snippet: string;
  }>;
}

export interface ResearchLogEntry {
  timestamp: number;
  type: 'search' | 'fetch' | 'analyze' | 'synthesize' | 'info';
  message: string;
}

// ============================================
// STUDIO OUTPUT TYPES
// ============================================

export type StudioOutputType = 'mindmap' | 'quiz' | 'guide' | 'faq' | 'timeline' | 'table' | 'flashcards' | 'audio' | 'video' | 'research';

export interface StudioOutput {
  id: string;
  project_id: string;
  type: StudioOutputType;
  title: string;
  content?: string; // JSON structure specific to type
  source_ids?: string; // JSON array of resource IDs used
  file_path?: string; // for audio/video files
  metadata?: string; // JSON additional data
  deck_id?: string; // for type=flashcards, FK to flashcard_decks
  resource_id?: string; // optional focus resource when generating
  created_at: number;
  updated_at: number;
  deck_card_count?: number; // populated by getByProject JOIN
}

export interface MindMapNode {
  id: string;
  label: string;
  description?: string;
  children?: MindMapNode[];
}

export interface MindMapData {
  nodes: Array<{ id: string; label: string; description?: string; position?: { x: number; y: number } }>;
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
}

export interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  question: string;
  options?: string[];
  correct: number | string;
  explanation: string;
  source_citation?: { source_id: string; passage: string };
}

export interface QuizData {
  questions: QuizQuestion[];
}

export interface StudyGuideData {
  sections: Array<{
    title: string;
    content: string; // markdown
  }>;
}

export interface FAQData {
  pairs: Array<{
    question: string;
    answer: string;
    source_id?: string;
  }>;
}

export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  source_id?: string;
}

export interface TimelineData {
  events: TimelineEvent[];
}

export interface DataTableData {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number>>;
}

// ============================================
// GRAPH VIEW TYPES
// ============================================

export type GraphNodeType =
  | 'resource'    // Linked to a resource
  | 'concept'     // Extracted concept
  | 'person'      // Person mention
  | 'location'    // Place
  | 'event'       // Event
  | 'topic'       // Topic cluster
  | 'study_material';  // Studio outputs (flashcards, guides, etc.)

export interface GraphNode {
  id: string;
  resource_id?: string;
  label: string;
  type: GraphNodeType;
  properties?: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;           // 'mentions', 'cites', 'similar', etc.
  weight: number;             // 0.0-1.0 (strength)
  metadata?: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ResourceLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  weight: number;
  metadata?: string;
  created_at: number;
}

export type GraphLayoutType = 'force' | 'hierarchical' | 'circular' | 'radial';

export interface GraphFilterOptions {
  nodeTypes?: GraphNodeType[];
  relationTypes?: string[];
  minWeight?: number;
  searchQuery?: string;
}

// React Flow node data structure
export interface GraphNodeData {
  id: string;
  label: string;
  type: GraphNodeType;
  resourceId?: string;
  resourceType?: ResourceType;
  metadata?: Record<string, any>;
}

// React Flow edge data structure
export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  relation: string;
  weight: number;
}

// Complete graph view state
export interface GraphViewState {
  nodes: Array<{
    id: string;
    data: GraphNodeData;
    position: { x: number; y: number };
    type?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    data?: GraphEdgeData;
    type?: string;
  }>;
  focusNodeId?: string;
  depth: number;
  strategies: string[];
  layout: GraphLayoutType;
  filters: GraphFilterOptions;
}

// Graph generation options
export interface GraphGenerationOptions {
  projectId?: string;
  focusResourceId?: string;
  maxDepth?: number;
  strategies?: Array<'mentions' | 'links' | 'semantic' | 'tags' | 'studio' | 'ai'>;
  maxNodes?: number;
  minWeight?: number;
}

// Graph analysis results
export interface GraphAnalysisResult {
  hubs: Array<{ nodeId: string; degree: number }>;
  clusters: Array<{ nodes: string[]; size: number }>;
  isolated: string[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    avgDegree: number;
    density: number;
  };
}

// ============================================
// AUDIO OVERVIEW TYPES
// ============================================

export interface AudioOverviewData {
  format: 'podcast' | 'briefing' | 'debate';
  transcript: {
    lines: Array<{
      speaker: string;
      text: string;
      startTime?: number;
    }>;
  };
  audioPath?: string;
  duration?: number;
}
