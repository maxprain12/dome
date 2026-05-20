/**
 * Client-side PPTX post-process so pptx-preview does not crash on agent-generated decks.
 * Mirrors electron/pptx-normalize.cjs (keep in sync).
 */
import JSZip from 'jszip';

function bgXml(hexColor: string): string {
  const color = (hexColor || 'FFFFFF').replace(/^#/, '').slice(0, 6);
  return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></p:bgPr></p:bg>`;
}

function hasResolvableBackground(xml: string): boolean {
  return /<p:cSld[\s\S]*?<p:bg[\s\S]*?(<a:solidFill|<a:gradFill|<a:blipFill|<p:bgRef)/i.test(xml);
}

function injectOrFixBackground(xml: string, hexColor: string, forceSolidOnSlides = false): string {
  const snippet = bgXml(hexColor);
  const isSlide = /^<\?xml[\s\S]*<p:sld[\s>]/i.test(xml) || /<p:sld[\s>]/i.test(xml);

  if (isSlide || forceSolidOnSlides) {
    if (/<p:cSld[\s\S]*?<p:bg[\s\S]*?<a:solidFill/i.test(xml)) return xml;
    if (/<p:bg[\s\S]*?<\/p:bg>/i.test(xml)) {
      return xml.replace(/<p:bg[\s\S]*?<\/p:bg>/i, snippet);
    }
    return xml.replace(/(<p:cSld(?:\s[^>]*)?>)/i, `$1${snippet}`);
  }

  if (hasResolvableBackground(xml)) return xml;
  if (/<p:cSld[\s\S]*?<p:bg/i.test(xml)) {
    return xml.replace(/<p:bg[\s\S]*?<\/p:bg>/i, snippet);
  }
  return xml.replace(/(<p:cSld(?:\s[^>]*)?>)/i, `$1${snippet}`);
}

const SLIDE_PATH = /^ppt\/slides\/slide\d+\.xml$/i;
const CONTENT_TYPES_PATH = '[Content_Types].xml';
const OVERRIDE_RE = /<Override\b[^>]*\bPartName="([^"]+)"[^>]*\/?>/gi;

/** Count slide parts inside a PPTX zip. */
export async function countSlidesInArrayBuffer(input: ArrayBuffer): Promise<number> {
  const zip = await JSZip.loadAsync(input);
  return Object.keys(zip.files).filter((p) => SLIDE_PATH.test(p)).length;
}

async function repairContentTypes(zip: JSZip): Promise<boolean> {
  const entry = zip.file(CONTENT_TYPES_PATH);
  if (!entry) return false;

  const xml = await entry.async('string');
  let changed = false;
  const next = xml.replace(OVERRIDE_RE, (full, partName) => {
    const partPath = partName.startsWith('/') ? partName.slice(1) : partName;
    if (zip.file(partPath)) return full;
    changed = true;
    return '';
  });

  if (!changed) return false;
  zip.file(CONTENT_TYPES_PATH, next.replace(/\s{2,}/g, ' ').trim());
  return true;
}

/** Ensure slides are renderable and [Content_Types].xml matches zip contents. */
export async function normalizePptxArrayBuffer(
  input: ArrayBuffer,
  bgColor = 'FFFFFF',
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(input);
  let changed = await repairContentTypes(zip);

  const slideTargets = Object.keys(zip.files).filter((p) => SLIDE_PATH.test(p));
  for (const slidePath of slideTargets) {
    const entry = zip.file(slidePath);
    if (!entry) continue;
    const xml = await entry.async('string');
    const next = injectOrFixBackground(xml, bgColor, true);
    if (next !== xml) {
      zip.file(slidePath, next);
      changed = true;
    }
  }

  if (!changed) return input;
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
