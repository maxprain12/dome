/* eslint-disable no-console */
/**
 * Thumbnail Generation Module - Main Process
 * Generates thumbnails for various file types
 */

const path = require('path');
const fs = require('fs');

// Thumbnail configuration
const THUMBNAIL_CONFIG = {
  maxWidth: 400,
  maxHeight: 400,
  quality: 80, // JPEG quality
  format: 'jpeg', // Output format for thumbnails
};

// Try to load sharp (may not be installed)
let sharp = null;
try {
  sharp = require('sharp');
  console.log('[Thumbnail] sharp module loaded successfully');
} catch (error) {
  console.warn('[Thumbnail] sharp module not available, image thumbnails disabled');
}

/**
 * Check if thumbnail generation is available
 * @returns {boolean}
 */
function isAvailable() {
  return sharp !== null;
}

/**
 * Generate thumbnail for an image file
 * @param {string} filePath - Path to the image file
 * @returns {Promise<string|null>} Base64 data URL or null if failed
 */
async function generateImageThumbnail(filePath) {
  if (!sharp) {
    console.warn('[Thumbnail] sharp not available, skipping image thumbnail');
    return null;
  }

  if (!fs.existsSync(filePath)) {
    console.error('[Thumbnail] File not found:', filePath);
    return null;
  }

  try {
    const buffer = await sharp(filePath)
      .resize(THUMBNAIL_CONFIG.maxWidth, THUMBNAIL_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_CONFIG.quality })
      .toBuffer();

    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error('[Thumbnail] Error generating image thumbnail:', error.message);
    return null;
  }
}

/**
 * Generate thumbnail from a buffer
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<string|null>} Base64 data URL or null if failed
 */
async function generateThumbnailFromBuffer(buffer) {
  if (!sharp) {
    console.warn('[Thumbnail] sharp not available, skipping thumbnail generation');
    return null;
  }

  try {
    const thumbnailBuffer = await sharp(buffer)
      .resize(THUMBNAIL_CONFIG.maxWidth, THUMBNAIL_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_CONFIG.quality })
      .toBuffer();

    return `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
  } catch (error) {
    console.error('[Thumbnail] Error generating thumbnail from buffer:', error.message);
    return null;
  }
}

/**
 * Generate a placeholder thumbnail based on file type
 * @param {string} type - Resource type (pdf, video, audio, etc.)
 * @param {string} mimeType - MIME type
 * @returns {string|null} Placeholder data URL or null
 */
function generatePlaceholder(type, mimeType) {
  // For now, return null - placeholders can be handled by the UI
  // In the future, we could generate SVG placeholders here
  return null;
}

/**
 * Escape XML special characters for SVG generation
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a branded document placeholder thumbnail as SVG
 * @param {string} filePath - Path to the file
 * @param {string} mimeType - MIME type
 * @param {string|null} textPreview - Extracted text preview
 * @returns {string|null} Base64 data URL of SVG
 */
function generateDocumentPlaceholder(filePath, mimeType, textPreview) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');

  const colors = {
    docx: { bg: '#e8f0fe', fg: '#2b579a', label: 'DOCX', icon: 'W' },
    doc: { bg: '#e8f0fe', fg: '#2b579a', label: 'DOC', icon: 'W' },
    xlsx: { bg: '#e6f4ea', fg: '#217346', label: 'XLSX', icon: 'X' },
    xls: { bg: '#e6f4ea', fg: '#217346', label: 'XLS', icon: 'X' },
    csv: { bg: '#e0f7fa', fg: '#00838f', label: 'CSV', icon: 'C' },
    txt: { bg: '#f3f4f6', fg: '#6b7280', label: 'TXT', icon: 'T' },
    md: { bg: '#f3f4f6', fg: '#6b7280', label: 'MD', icon: 'M' },
    json: { bg: '#fef3c7', fg: '#92400e', label: 'JSON', icon: 'J' },
    rtf: { bg: '#f3f4f6', fg: '#6b7280', label: 'RTF', icon: 'R' },
    pptx: { bg: '#fce8e6', fg: '#c4320a', label: 'PPTX', icon: 'P' },
    ppt: { bg: '#fce8e6', fg: '#c4320a', label: 'PPT', icon: 'P' },
  };

  const config = colors[ext] || { bg: '#f5f5f5', fg: '#666666', label: ext.toUpperCase() || 'DOC', icon: 'D' };

  // Truncate preview text and split into lines for SVG rendering
  const previewText = textPreview ? textPreview.substring(0, 180) : '';
  const lines = [];
  const maxLineLength = 45;
  const words = previewText.split(/\s+/);
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > maxLineLength) {
      lines.push(currentLine.trim());
      currentLine = word;
      if (lines.length >= 6) break;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine && lines.length < 6) {
    lines.push(currentLine.trim());
  }

  const textLines = lines
    .map((line, i) => `<text x="24" y="${72 + i * 18}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#6b7280">${escapeXml(line)}</text>`)
    .join('\n    ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="${config.bg}" rx="8"/>
    <rect x="16" y="16" width="48" height="28" rx="6" fill="${config.fg}"/>
    <text x="40" y="35" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="white">${escapeXml(config.label)}</text>
    ${textLines}
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Generate thumbnail for any supported file type
 * @param {string} filePath - Path to the file
 * @param {string} type - Resource type
 * @param {string} mimeType - MIME type
 * @returns {Promise<string|null>} Base64 data URL or null
 */
async function generateThumbnail(filePath, type, mimeType) {
  // Image files - generate actual thumbnail
  if (type === 'image' || mimeType?.startsWith('image/')) {
    return generateImageThumbnail(filePath);
  }

  // PDF files - could implement PDF thumbnail with pdf.js or similar
  // For now, return null and use UI placeholder
  if (type === 'pdf' || mimeType === 'application/pdf') {
    // TODO: Implement PDF thumbnail generation
    return null;
  }

  // Video files - could implement video thumbnail with ffmpeg
  // For now, return null and use UI placeholder
  if (type === 'video' || mimeType?.startsWith('video/')) {
    // TODO: Implement video thumbnail generation
    return null;
  }

  // Document files - generate branded placeholder thumbnail
  if (type === 'document') {
    // Try to extract text preview for the placeholder
    let textPreview = null;
    try {
      const documentExtractor = require('./document-extractor.cjs');
      textPreview = await documentExtractor.extractDocumentText(filePath, mimeType);
    } catch (extractError) {
      // Text extraction is optional for thumbnail generation
      console.warn('[Thumbnail] Could not extract text for document placeholder:', extractError.message);
    }
    return generateDocumentPlaceholder(filePath, mimeType, textPreview);
  }

  // For other types, return null
  return null;
}

/**
 * Get image metadata (dimensions, format, etc.)
 * @param {string} filePath - Path to the image file
 * @returns {Promise<{width: number, height: number, format: string}|null>}
 */
async function getImageMetadata(filePath) {
  if (!sharp) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const metadata = await sharp(filePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch (error) {
    console.error('[Thumbnail] Error getting image metadata:', error.message);
    return null;
  }
}

module.exports = {
  isAvailable,
  generateImageThumbnail,
  generateThumbnailFromBuffer,
  generatePlaceholder,
  generateDocumentPlaceholder,
  generateThumbnail,
  getImageMetadata,
  THUMBNAIL_CONFIG,
};
