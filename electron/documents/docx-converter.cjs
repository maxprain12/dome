/* eslint-disable no-console */
/**
 * DOCX Converter - Main Process
 * Converts HTML to DOCX format using html-to-docx.
 */

let HTMLtoDOCX = null;
try {
  HTMLtoDOCX = require('html-to-docx');
} catch (error) {
  console.warn('[DocxConverter] html-to-docx not available:', error?.message);
}

/**
 * Convert HTML string to DOCX Buffer
 * @param {string} html - HTML content
 * @returns {Promise<Buffer|null>} DOCX buffer or null if conversion fails
 */
async function htmlToDocxBuffer(html) {
  if (!HTMLtoDOCX) {
    console.error('[DocxConverter] html-to-docx module not loaded');
    return null;
  }

  try {
    const sanitized = typeof html === 'string' && html.trim() ? html : '<p></p>';
    const buffer = await HTMLtoDOCX(sanitized, null, {
      orientation: 'portrait',
      margins: { top: 1440, right: 1800, bottom: 1440, left: 1800 },
    });
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } catch (error) {
    console.error('[DocxConverter] Conversion failed:', error?.message);
    throw error;
  }
}

module.exports = {
  htmlToDocxBuffer,
};
