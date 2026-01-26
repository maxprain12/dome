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
  generateThumbnail,
  getImageMetadata,
  THUMBNAIL_CONFIG,
};
