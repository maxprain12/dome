import { EVENT_CARD_DESIGN_DEFAULTS } from '@/lib/ui/palettes';
import type {
  EventCardDesign,
  EventCardFontWeight,
  EventCardLayout,
  EventCardQrStyle,
} from './socialTypes';

export const DEFAULT_BACKGROUND = EVENT_CARD_DESIGN_DEFAULTS.background;
export const DEFAULT_FOREGROUND = EVENT_CARD_DESIGN_DEFAULTS.foreground;
export const DEFAULT_LABEL = EVENT_CARD_DESIGN_DEFAULTS.label;

/** Official Wallet/event cover strip (width × height). */
export const EVENT_CARD_COVER_WIDTH = 1125;
export const EVENT_CARD_COVER_HEIGHT = 294;
/** CSS aspect-ratio value matching 1125×294. */
export const EVENT_CARD_COVER_ASPECT = `${EVENT_CARD_COVER_WIDTH} / ${EVENT_CARD_COVER_HEIGHT}`;

export const EVENT_CARD_LAYOUTS: EventCardLayout[] = ['classic', 'hero', 'split_qr', 'compact'];

export const EVENT_CARD_FONT_WEIGHTS: EventCardFontWeight[] = ['400', '500', '600', '700'];

export interface EventCardFontOption {
  id: string;
  label: string;
  stack: string;
}

/** System-safe stacks — no remote font downloads. */
export const EVENT_CARD_FONTS: EventCardFontOption[] = [
  {
    id: 'sans',
    label: 'Sans',
    stack: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    id: 'display',
    label: 'Display',
    stack: 'ui-rounded, "Avenir Next", Avenir, "Helvetica Neue", Helvetica, sans-serif',
  },
  {
    id: 'mono',
    label: 'Mono',
    stack: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  {
    id: 'humanist',
    label: 'Humanist',
    stack: '"Trebuchet MS", "Segoe UI", Candara, Calibri, sans-serif',
  },
  {
    id: 'slab',
    label: 'Slab',
    stack: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  },
];

const FONT_BY_ID = new Map(EVENT_CARD_FONTS.map((font) => [font.id, font]));

export function normalizeHex(value: string | undefined | null, fallback: string): string {
  const raw = (value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function isLayout(value: unknown): value is EventCardLayout {
  return typeof value === 'string' && (EVENT_CARD_LAYOUTS as string[]).includes(value);
}

function isQrStyle(value: unknown): value is EventCardQrStyle {
  return value === 'square' || value === 'rounded';
}

function isWeight(value: unknown): value is EventCardFontWeight {
  return typeof value === 'string' && (EVENT_CARD_FONT_WEIGHTS as string[]).includes(value);
}

function resolveFontId(value: string | undefined | null, fallback: string): string {
  if (value && FONT_BY_ID.has(value)) return value;
  return fallback;
}

export function fontStack(fontId: string | undefined | null, fallback = 'sans'): string {
  const id = resolveFontId(fontId, fallback);
  return FONT_BY_ID.get(id)?.stack ?? EVENT_CARD_FONTS[0].stack;
}

export function defaultEventCardDesign(): EventCardDesign {
  return {
    backgroundColor: DEFAULT_BACKGROUND,
    foregroundColor: DEFAULT_FOREGROUND,
    labelColor: DEFAULT_LABEL,
    primaryColor: DEFAULT_BACKGROUND,
    secondaryColor: DEFAULT_LABEL,
    titleFont: 'sans',
    bodyFont: 'sans',
    titleWeight: '600',
    bodyWeight: '400',
    layout: 'classic',
    qrStyle: 'rounded',
    showQr: true,
  };
}

/** Normalize inbound design (Provider or local) with color aliases. */
export function normalizeEventCardDesign(raw: EventCardDesign | null | undefined): EventCardDesign {
  const design = raw ?? {};
  const background = normalizeHex(
    design.backgroundColor ?? design.primaryColor,
    DEFAULT_BACKGROUND,
  );
  const foreground = normalizeHex(design.foregroundColor, DEFAULT_FOREGROUND);
  const label = normalizeHex(design.labelColor ?? design.secondaryColor, DEFAULT_LABEL);
  const defaults = defaultEventCardDesign();
  return {
    ...defaults,
    ...design,
    brandName: design.brandName,
    logoUrl: design.logoUrl ?? null,
    coverUrl: design.coverUrl ?? null,
    backgroundColor: background,
    foregroundColor: foreground,
    labelColor: label,
    primaryColor: background,
    secondaryColor: label,
    titleFont: resolveFontId(design.titleFont, defaults.titleFont ?? 'sans'),
    bodyFont: resolveFontId(design.bodyFont, defaults.bodyFont ?? 'sans'),
    titleWeight: isWeight(design.titleWeight) ? design.titleWeight : defaults.titleWeight,
    bodyWeight: isWeight(design.bodyWeight) ? design.bodyWeight : defaults.bodyWeight,
    layout: isLayout(design.layout) ? design.layout : defaults.layout,
    qrStyle: isQrStyle(design.qrStyle) ? design.qrStyle : defaults.qrStyle,
    showQr: typeof design.showQr === 'boolean' ? design.showQr : defaults.showQr,
  };
}

/** Serialize design for Provider — dual color keys for compatibility. */
export function serializeEventCardDesign(design: EventCardDesign): EventCardDesign {
  const normalized = normalizeEventCardDesign(design);
  return {
    brandName: normalized.brandName || undefined,
    logoUrl: normalized.logoUrl || null,
    coverUrl: normalized.coverUrl || null,
    backgroundColor: normalized.backgroundColor,
    foregroundColor: normalized.foregroundColor,
    labelColor: normalized.labelColor,
    primaryColor: normalized.backgroundColor,
    secondaryColor: normalized.labelColor,
    titleFont: normalized.titleFont,
    bodyFont: normalized.bodyFont,
    titleWeight: normalized.titleWeight,
    bodyWeight: normalized.bodyWeight,
    layout: normalized.layout,
    qrStyle: normalized.qrStyle,
    showQr: normalized.showQr,
  };
}
