// Tipos de recursos
export type ResourceType = 'note' | 'pdf' | 'video' | 'audio' | 'image' | 'url' | 'document' | 'folder';

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
  created_at: number;
  updated_at: number;
}

export interface ResourceMetadata {
  file_size?: number;
  file_hash?: string;
  duration?: number; // Para videos/audios
  page_count?: number; // Para PDFs
  url?: string; // Para recursos web
  thumbnail?: string;
  transcription?: string; // Para videos/audios
  summary?: string; // Generado por IA
  // Para recursos URL:
  url_type?: 'article' | 'youtube';
  scraped_content?: string;
  embedding?: number[];
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed';
  processed_at?: number;
  screenshot_path?: string; // Path interno de la captura guardada
  video_id?: string; // Para YouTube
  channel?: string; // Para YouTube
  [key: string]: any;
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
  [key: string]: any;
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
  metadata: any;
}

// Estilos de citación
export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard' | 'vancouver' | 'ieee';

// Tipos de providers de IA
export type AIProviderType = 
  | 'openai' 
  | 'anthropic' 
  | 'google' 
  | 'ollama'
  | 'synthetic'
  | 'venice'
  | 'copilot'
  | 'deepseek'
  | 'minimax'
  | 'moonshot'
  | 'qwen';

// Modo de autenticación para Anthropic (API key vs OAuth/Token de suscripción)
export type AnthropicAuthMode = 'api_key' | 'oauth' | 'token';

// Configuración de IA
export interface AISettings {
  provider: AIProviderType;
  api_key?: string;
  model?: string;
  embedding_model?: string;
  base_url?: string;
  // Anthropic OAuth/Token support (para suscripción Claude Pro/Max)
  auth_mode?: AnthropicAuthMode;
  oauth_token?: string;
  // Para Ollama:
  ollama_base_url?: string;
  ollama_model?: string;
  ollama_embedding_model?: string;
  ollama_temperature?: number;
  ollama_top_p?: number;
  ollama_num_predict?: number;
  // Para Venice:
  venice_privacy_mode?: 'private' | 'anonymized';
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

// Preferencias de la aplicación
export interface AppPreferences {
  theme: 'light' | 'dark' | 'auto';
  autoSave: boolean;
  autoBackup: boolean;
  citationStyle: CitationStyle;
  shortcuts?: Record<string, string>;
}

// Tipos para el editor tipo Notion
export interface CalloutBlockAttributes {
  icon?: string;
  color?: string;
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

export type MartinStatus = 'idle' | 'thinking' | 'speaking' | 'listening';

export interface MartinMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface MartinState {
  isOpen: boolean;
  isThinking: boolean;
  unreadCount: number;
  currentContext?: string;
}

// ============================================
// STUDIO OUTPUT TYPES
// ============================================

export type StudioOutputType = 'mindmap' | 'quiz' | 'guide' | 'faq' | 'timeline' | 'table' | 'audio' | 'video' | 'research';

export interface StudioOutput {
  id: string;
  project_id: string;
  type: StudioOutputType;
  title: string;
  content?: string; // JSON structure specific to type
  source_ids?: string; // JSON array of resource IDs used
  file_path?: string; // for audio/video files
  metadata?: string; // JSON additional data
  created_at: number;
  updated_at: number;
}

export interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
}

export interface MindMapData {
  nodes: Array<{ id: string; label: string; position?: { x: number; y: number } }>;
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
