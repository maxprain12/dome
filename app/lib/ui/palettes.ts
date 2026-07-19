/**
 * Content palettes — the ONLY place in app/ where hardcoded hex is allowed
 * (enforced by scripts/check-hardcoded-colors.mjs).
 *
 * These are DATA, not theme: user-pickable swatches persisted in the DB,
 * editor highlight colors written into document content, canvas node colors,
 * and canvas-rendering fallbacks. Theme colors (backgrounds, text, borders,
 * states) live in app/globals.css as CSS variables — never add them here.
 *
 * ⚠️ Folder/tag swatches are persisted as hex in resource metadata: changing
 * a value here ORPHANS existing items (they keep the old hex). Append new
 * entries instead of editing existing ones.
 */

/** Folder color swatches (FolderColorPicker) — persisted in resource metadata. */
export const FOLDER_COLOR_SWATCHES = [
  '#596037',
  '#6d7a42',
  '#7d8b52',
  '#8a9668',
  '#4a5429',
  '#3d4622',
  '#7b76d0',
  '#998eec',
  '#5550a8',
  '#22c55e',
  '#3b82f6',
  '#f97316',
  '#ef4444',
  '#6b7280',
  '#9ca3af',
  '#64748b',
] as const;

/** Default folder color (olive — matches --base in globals.css light theme). */
export const FOLDER_COLOR_DEFAULT = '#596037';

/** Labeled folder colors (UnifiedSidebar dropdown) — persisted in resource metadata. */
export const FOLDER_COLOR_OPTIONS = [
  { label: 'Oliva', value: '#596037' },
  { label: 'Violeta', value: '#7b76d0' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Gris', value: '#6b7280' },
  { label: 'Rojo', value: '#ef4444' },
  { label: 'Naranja', value: '#f97316' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Amarillo', value: '#eab308' },
  { label: 'Cian', value: '#06b6d4' },
] as const;

/** Legacy named folder colors (older resources persisted names, not hex). */
export const NAMED_FOLDER_COLORS: Record<string, string> = {
  blue: '#5B9BD5',
  purple: '#8B7EC8',
  green: '#5BA85A',
  yellow: '#D4A843',
  red: '#D05C5C',
  orange: '#D47B3F',
  pink: '#C45C8E',
  cyan: '#4BA3B5',
};

/** Compact swatch grid used by the folder-tab color popover. */
export const FOLDER_TAB_SWATCHES = [
  '#596037',
  '#6d7a42',
  '#7d8b52',
  '#8a9668',
  '#7b76d0',
  '#998eec',
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#6b7280',
] as const;

/** Deterministic tag colors (TagBrowser) — hashed by tag name. */
export const TAG_COLOR_PALETTE = [
  '#7b76d0',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#e85d4a',
  '#a855f7',
  '#6366f1',
  '#0ea5e9',
] as const;

export const TAG_COLOR_DEFAULT = '#7b76d0';

/** Resource-type accent used where no theme variable fits (video pink). */
export const CONTENT_PINK = '#ec4899';

/** Agent-canvas node colors (D3 SVG — needs literal values, no CSS vars). */
export const CANVAS_AGENT_COLORS: Record<string, { color: string; bg: string }> = {
  research: { color: '#0ea5e9', bg: '#f0f9ff' },
  writer: { color: '#22c55e', bg: '#f0fdf4' },
  review: { color: '#f59e0b', bg: '#fffbeb' },
  data: { color: '#596037', bg: '#E0EAB4' },
  planner: { color: '#8b5cf6', bg: '#f5f3ff' },
  creative: { color: '#ec4899', bg: '#fdf2f8' },
};

/**
 * Tiptap highlight colors — written INTO document content as mark attrs, so
 * they must stay literal hex (documents travel between themes/devices).
 */
export const EDITOR_HIGHLIGHT_HEX = {
  default: '#ffffff',
  gray: '#f8f8f7',
  brown: '#f4eeee',
  orange: '#fbecdd',
  yellow: '#fef9c3',
  green: '#dcfce7',
  blue: '#e0f2fe',
  purple: '#f3e8ff',
  pink: '#fcf1f6',
  red: '#ffe4e6',
} as const;

/** Marketplace item-type icon tints (decorative pastels, theme-independent). */
export const MARKETPLACE_TYPE_TINTS: Record<string, { iconBg: string; iconColor: string }> = {
  workflows: { iconBg: '#d1fae5', iconColor: '#059669' },
  mcp: { iconBg: '#fef3c7', iconColor: '#d97706' },
  skills: { iconBg: '#ede9fe', iconColor: '#7c3aed' },
  plugins: { iconBg: '#dbeafe', iconColor: '#2563eb' },
};

/**
 * PDF annotation canvas fallbacks — used when resolveCssColor() cannot read
 * a CSS variable (canvas runs outside the DOM cascade).
 */
export const PDF_CANVAS_FALLBACKS = {
  accent: '#0ea5e9',
  warning: '#f59e0b',
  text: '#111827',
} as const;

/** Default highlight color the PDF annotation agent tool writes (persisted). */
export const PDF_HIGHLIGHT_DEFAULT = '#ffeb3b';

/**
 * Legacy persisted PDF highlight hex → theme variable (annotations created
 * before the palette migration stored raw hex in the DB).
 */
export const LEGACY_PDF_HIGHLIGHT_VARS: Record<string, string> = {
  '#E6C47A': 'var(--warning)',
  '#596037': 'var(--primary)',
  '#A4AD7A': 'var(--primary)',
  '#E88585': 'var(--destructive)',
  '#ef4444': 'var(--destructive)',
  '#0ea5e9': 'var(--primary)',
};

/** PPTX slides default "light" color (slide content, not app theme). */
export const PPT_SLIDE_LIGHT_DEFAULT = '#ffffff';

/**
 * Social event-card design defaults — persisted in event_cards.design JSON and
 * baked into export canvases / QR bitmaps (theme CSS vars do not apply).
 */
export const EVENT_CARD_DESIGN_DEFAULTS = {
  background: '#5e6a34',
  foreground: '#ffffff',
  label: '#ffffff',
} as const;

/** QR module colors for event-card preview/export (qrcode lib needs literals). */
export const EVENT_CARD_QR_COLORS = {
  dark: '#111111',
  light: '#ffffff',
} as const;
