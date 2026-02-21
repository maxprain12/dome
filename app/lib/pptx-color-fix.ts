/**
 * PPTX color fix utilities.
 * pptx-preview resolves theme color refs to dk1 (black) for text with no explicit color.
 * On dark slides, this makes text invisible. We detect dark backgrounds and replace
 * near-black text with the theme's lt1 (light) color.
 */

const TEXT_TAGS = ['p', 'span', 'div', 'td', 'th', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/** Parse rgb/rgba string to r,g,b. Returns null if not a solid color. */
function parseRgb(str: string): { r: number; g: number; b: number } | null {
  const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
  };
}

/** Parse hex color to r,g,b. */
function parseHex(str: string): { r: number; g: number; b: number } | null {
  const match = str.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

/** Perceptual luminance (0 = black, 1 = white). */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Get the slide's background color. Fallback to children when wrapper is transparent.
 */
export function getSlideBackgroundColor(wrapper: HTMLElement): { r: number; g: number; b: number } | null {
  const bg = window.getComputedStyle(wrapper).backgroundColor;
  let rgb = parseRgb(bg);
  if (rgb) return rgb;

  for (const child of wrapper.children) {
    const cb = window.getComputedStyle(child as HTMLElement).backgroundColor;
    rgb = parseRgb(cb);
    if (rgb) return rgb;
  }
  return null;
}

/** Check if a color is near-black (all channels below threshold). */
function isNearBlack(r: number, g: number, b: number, threshold = 60): boolean {
  return r < threshold && g < threshold && b < threshold;
}

/** Parse color string (hex or rgb) to r,g,b. */
function parseColor(str: string): { r: number; g: number; b: number } | null {
  const rgb = parseRgb(str);
  if (rgb) return rgb;
  return parseHex(str);
}

/**
 * Fix near-black text on dark-background slides.
 *
 * pptx-preview resolves PPTX theme color references to dk1 (Dark 1, typically
 * #000000) for text with no explicit color. On dark slides the text becomes
 * nearly invisible.
 *
 * Strategy:
 * 1. Detect dark background (luminance < 0.4) — with fallback to child elements.
 * 2. Fix elements with inline near-black color (original logic).
 * 3. Fix elements whose computed color is near-black (catches inherited black).
 */
export function fixDarkSlideTextColors(container: HTMLElement, lightColor: string): void {
  const wrapper = container.querySelector('.pptx-preview-slide-wrapper') as HTMLElement | null;
  if (!wrapper) return;

  const bgColor = getSlideBackgroundColor(wrapper);
  if (!bgColor) return;

  const bgLum = luminance(bgColor.r, bgColor.g, bgColor.b);
  if (bgLum >= 0.4) return; // Light background — no fix needed

  // 1. Fix elements with inline style color
  wrapper.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
    const c = el.style.color;
    if (!c) return;

    const rgb = parseColor(c);
    if (!rgb) return;

    if (isNearBlack(rgb.r, rgb.g, rgb.b, 50)) {
      el.style.color = lightColor;
    }
  });

  // 2. Fix elements whose computed color is near-black (inherited or via CSS)
  wrapper.querySelectorAll<HTMLElement>(TEXT_TAGS.join(', ')).forEach((el) => {
    const computed = window.getComputedStyle(el).color;
    const rgb = parseRgb(computed);
    if (!rgb) return;

    if (isNearBlack(rgb.r, rgb.g, rgb.b, 60)) {
      el.style.color = lightColor;
    }
  });
}
