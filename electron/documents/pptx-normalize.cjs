'use strict';
/**
 * Post-process PPTX buffers so pptx-preview can render agent-generated decks.
 *
 * PptxGenJS often writes [Content_Types].xml Override entries for slideMaster2..N
 * that do not exist in the zip. pptx-preview swallows the load error and returns 0 slides.
 */
const JSZip = require('jszip');

/**
 * @param {string} hexColor 6-char hex without #
 * @returns {string}
 */
function bgXml(hexColor) {
  const color = (hexColor || 'FFFFFF').replace(/^#/, '').slice(0, 6);
  return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></p:bgPr></p:bg>`;
}

/**
 * @param {string} xml
 * @returns {boolean}
 */
function hasResolvableBackground(xml) {
  return /<p:cSld[\s\S]*?<p:bg[\s\S]*?(<a:solidFill|<a:gradFill|<a:blipFill|<p:bgRef)/i.test(xml);
}

/**
 * @param {string} xml
 * @param {string} hexColor
 * @param {boolean} [forceSolidOnSlides=false]
 * @returns {string}
 */
function injectOrFixBackground(xml, hexColor, forceSolidOnSlides = false) {
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

/**
 * Remove [Content_Types].xml Override rows whose part file is missing from the zip.
 * @param {JSZip} zip
 * @returns {Promise<boolean>}
 */
async function repairContentTypes(zip) {
  const entry = zip.file(CONTENT_TYPES_PATH);
  if (!entry) return false;

  const xml = await entry.async('string');
  let changed = false;
  const next = xml.replace(OVERRIDE_RE, (full, partName) => {
    const path = partName.startsWith('/') ? partName.slice(1) : partName;
    if (zip.file(path)) return full;
    changed = true;
    return '';
  });

  if (!changed) return false;
  zip.file(CONTENT_TYPES_PATH, next.replace(/\s{2,}/g, ' ').trim());
  return true;
}

/**
 * @param {Buffer} buffer
 * @param {string} [bgColor='FFFFFF']
 * @returns {Promise<Buffer>}
 */
async function normalizePptxBuffer(buffer, bgColor = 'FFFFFF') {
  const zip = await JSZip.loadAsync(buffer);
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

  if (!changed) return buffer;
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { normalizePptxBuffer, repairContentTypes };
