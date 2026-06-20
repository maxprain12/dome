export interface CaretPoint {
  /** X coordinate relative to the textarea (px). */
  x: number;
  /** Y coordinate relative to the textarea (px) — top of the caret's line. */
  y: number;
  /** Height of the caret's line (px). */
  height: number;
}

const MIRROR_PROPERTIES = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
] as const;

let mirror: HTMLDivElement | null = null;

/**
 * Returns the pixel coordinates of the caret inside a `<textarea>`.
 *
 * Implementation: build a mirror `<div>` off-screen that copies the textarea's
 * typography (font, padding, border, line-height, etc.), paste the text up to
 * the caret into it, then append a marker `<span>` and read its
 * `offsetTop/offsetLeft/offsetHeight`. Results are relative to the textarea's
 * content box — to convert to viewport coords, add the textarea's bounding
 * rect (left, top).
 *
 * Standard technique popularized by CodeMirror / Inputosaurus; safe for our
 * needs (textarea — no rich text wrapping).
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): CaretPoint {
  const value = textarea.value;

  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.contentEditable = 'false';
  }
  const doc = mirror.ownerDocument;
  const win = doc.defaultView ?? window;
  const computed = win.getComputedStyle(textarea);

  // Apply mirror properties from the live textarea so they stay in sync.
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';

  for (const prop of MIRROR_PROPERTIES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mirror.style as any)[prop] = computed[prop as any];
  }

  const slice = value.slice(0, position);
  // Normalize trailing newlines so the marker spans the same row the caret is on.
  const safe = slice
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n$/g, '\n\u200B');

  mirror.innerHTML = '';
  const textNode = doc.createTextNode(safe);
  mirror.appendChild(textNode);
  const span = doc.createElement('span');
  span.textContent = '\u200B';
  mirror.appendChild(span);

  // Guard: ensure the mirror is attached so `offset*` return real numbers.
  if (!mirror.isConnected) {
    document.body.appendChild(mirror);
  }

  const coords: CaretPoint = {
    x: span.offsetLeft,
    y: span.offsetTop,
    height: span.offsetHeight || parseInt(computed.lineHeight || '0', 10) || 18,
  };

  return coords;
}