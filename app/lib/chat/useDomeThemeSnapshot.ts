import { useEffect, useMemo, useState } from 'react';

/**
 * Canonical list of Dome design tokens that artifacts (especially HTML iframes)
 * must inherit from the host app. The hook below reads these from the root
 * `:root` element and tracks changes to `data-theme` so the consumer can
 * re-inject them into the artifact surface.
 */
export const DOME_TOKEN_NAMES = [
  // Surfaces
  '--bg',
  '--bg-secondary',
  '--bg-tertiary',
  '--bg-hover',
  '--bg-translucent',
  // Text
  '--primary-text',
  '--secondary-text',
  '--tertiary-text',
  // Borders
  '--border',
  '--border-hover',
  // Brand / accent
  '--accent',
  '--accent-hover',
  '--translucent',
  '--base',
  '--base-text',
  // Semantic
  '--success',
  '--success-bg',
  '--warning',
  '--warning-bg',
  '--error',
  '--error-bg',
  '--info',
  '--info-bg',
  // Radii
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--radius-2xl',
  '--radius-full',
  // Spacing
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-8',
  // Shadows
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  // Typography
  '--font-sans',
  '--font-mono',
  // Transitions
  '--transition-fast',
  '--transition-base',
] as const;

export type DomeTokenName = (typeof DOME_TOKEN_NAMES)[number];
export type DomeTokenVars = Record<string, string>;

export type DomeThemeSnapshot = {
  /** `light` | `dark` | whatever `data-theme` reports. */
  theme: string;
  /** Monotonically increasing key that changes whenever tokens change. */
  themeKey: number;
  /** Resolved values for every token in `DOME_TOKEN_NAMES`. */
  vars: DomeTokenVars;
  /** Precomputed CSS string `--name: value;` ready for a `<style>` block. */
  cssVars: string;
};

function readTokens(): DomeTokenVars {
  if (typeof window === 'undefined') return {};
  const cs = window.getComputedStyle(document.documentElement);
  const out: DomeTokenVars = {};
  for (const name of DOME_TOKEN_NAMES) {
    const raw = cs.getPropertyValue(name);
    if (raw) out[name] = raw.trim();
  }
  return out;
}

function readTheme(): string {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') ?? 'light';
}

function toCssVars(vars: DomeTokenVars): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
}

/**
 * Reads Dome's design tokens from `:root` and re-reads them whenever the
 * `data-theme` attribute flips. Returns a memoized snapshot that artifact
 * renderers can inject into their rendering surface (e.g. `srcdoc` of an
 * iframe) and re-emit reactively on theme changes.
 */
export function useDomeThemeSnapshot(): DomeThemeSnapshot {
  const [theme, setTheme] = useState<string>(() => readTheme());
  const [bumpKey, setBumpKey] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          setTheme(readTheme());
          setBumpKey((k) => k + 1);
          return;
        }
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return useMemo<DomeThemeSnapshot>(() => {
    const vars = readTokens();
    return {
      theme,
      themeKey: bumpKey,
      vars,
      cssVars: toCssVars(vars),
    };
  }, [theme, bumpKey]);
}

/**
 * Produces the Dome reset CSS that every artifact iframe must carry. The
 * reset is tokenized so the iframe looks like the rest of the Dome app.
 * Intentionally lightweight: we only style `html`/`body` aggressively
 * (with `!important` on background / color to beat rogue model styles);
 * headings, buttons, etc. stay flexible so the artifact author can override.
 */
export function buildDomeResetCss(): string {
  return `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
html{color-scheme:light dark}
html,body{background:var(--bg) !important;color:var(--primary-text) !important;font-family:var(--font-sans);font-size:14px;line-height:1.5}
a{color:var(--accent);text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:3px}
a:hover{color:var(--accent-hover);text-decoration-color:var(--accent)}
code,kbd,samp{font-family:var(--font-mono);font-size:12px;background:var(--bg-tertiary);color:var(--primary-text);border:1px solid var(--border);border-radius:var(--radius-md);padding:1px 6px}
pre{font-family:var(--font-mono);font-size:12px;background:var(--bg-secondary);color:var(--primary-text);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px;overflow:auto}
pre code{background:transparent;border:0;padding:0}
hr{border:0;border-top:1px solid var(--border);margin:16px 0}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid var(--border);padding:8px 10px;text-align:left}
thead th{background:var(--bg-tertiary);color:var(--primary-text);font-weight:600}
button,input,select,textarea{font:inherit;color:inherit}
button{background:var(--bg-secondary);color:var(--primary-text);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 10px;cursor:pointer;transition:background-color var(--transition-fast),border-color var(--transition-fast)}
button:hover{background:var(--bg-hover);border-color:var(--border-hover)}
input,select,textarea{background:var(--bg);color:var(--primary-text);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 8px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--translucent)}
h1,h2,h3,h4,h5,h6{color:var(--primary-text);font-family:var(--font-sans);font-weight:600;margin:12px 0 6px}
h1{font-size:20px;letter-spacing:-0.01em}h2{font-size:16px}h3{font-size:15px}h4,h5,h6{font-size:14px}
p{margin:0 0 8px;color:var(--primary-text)}
small{color:var(--tertiary-text)}
`.trim();
}

/**
 * Builds the composed `<style id="dome-theme">` block: Dome tokens resolved to
 * concrete values at `:root` + the tokenized reset. Intended to be injected at
 * the head of the `srcdoc` / `document.write` payload, BEFORE the artifact's
 * own `css` so authors can override when needed (Dome reset only uses
 * `!important` on `html, body` background/color so hardcoded dark themes
 * from the model don't leak through).
 */
export function buildDomeThemeStyleContent(vars: DomeTokenVars): string {
  const varsCss = toCssVars(vars);
  const reset = buildDomeResetCss();
  return `:root{${varsCss}}\n${reset}`;
}
