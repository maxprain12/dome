/* eslint-disable no-console */
/**
 * Crop Image Module - Main Process
 * Provides image cropping and resizing functionality using Sharp
 */

const path = require('path');
const fs = require('fs');

// Try to load sharp (may not be installed)
let sharp = null;
try {
  sharp = require('sharp');
  console.log('[CropImage] sharp module loaded successfully');
} catch (error) {
  console.warn('[CropImage] sharp module not available, image cropping disabled');
}

/**
 * Check if crop functionality is available
 * @returns {boolean}
 */
function isAvailable() {
  return sharp !== null;
}

/**
 * Crop an image file
 * @param {string} filePath - Path to the image file
 * @param {Object} options - Crop options
 * @param {number} options.x - X coordinate of the top-left corner
 * @param {number} options.y - Y coordinate of the top-left corner
 * @param {number} options.width - Width of the crop area
 * @param {number} options.height - Height of the crop area
 * @param {string} [options.format='jpeg'] - Output format: 'jpeg', 'png', 'webp'
 * @param {number} [options.quality=90] - Output quality (1-100)
 * @param {number} [options.maxWidth] - Optional max width for resizing after crop
 * @param {number} [options.maxHeight] - Optional max height for resizing after crop
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function cropImage(filePath, options) {
  if (!sharp) {
    return { success: false, error: 'Sharp not available' };
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found' };
  }

  const { x = 0, y = 0, width, height, format = 'jpeg', quality = 90, maxWidth, maxHeight } = options;

  if (!width || !height) {
    return { success: false, error: 'Width and height are required' };
  }

  try {
    let pipeline = sharp(filePath);

    // Apply crop
    pipeline = pipeline.extract({
      left: Math.max(0, Math.floor(x)),
      top: Math.max(0, Math.floor(y)),
      width: Math.floor(width),
      height: Math.floor(height),
    });

    // Apply resize if max dimensions provided
    if (maxWidth || maxHeight) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Set output format and quality
    switch (format.toLowerCase()) {
      case 'png':
        pipeline = pipeline.png({ quality: Math.min(100, Math.max(1, quality)) });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: Math.min(100, Math.max(1, quality)) });
        break;
      case 'jpeg':
      case 'jpg':
      default:
        pipeline = pipeline.jpeg({ quality: Math.min(100, Math.max(1, quality)) });
        break;
    }

    const buffer = await pipeline.toBuffer();

    const mimeType = format.toLowerCase() === 'jpg' ? 'jpeg' : format.toLowerCase();
    const dataUrl = `data:image/${mimeType};base64,${buffer.toString('base64')}`;

    return { success: true, dataUrl };
  } catch (error) {
    console.error('[CropImage] Error cropping image:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Resize an image file
 * @param {string} filePath - Path to the image file
 * @param {Object} options - Resize options
 * @param {number} [options.width] - Target width
 * @param {number} [options.height] - Target height
 * @param {string} [options.fit='inside'] - Fit mode: 'cover', 'contain', 'fill', 'inside', 'outside'
 * @param {string} [options.format='jpeg'] - Output format
 * @param {number} [options.quality=90] - Output quality
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function resizeImage(filePath, options) {
  if (!sharp) {
    return { success: false, error: 'Sharp not available' };
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found' };
  }

  const { width, height, fit = 'inside', format = 'jpeg', quality = 90 } = options;

  if (!width && !height) {
    return { success: false, error: 'At least one of width or height is required' };
  }

  try {
    let pipeline = sharp(filePath);

    // Apply resize
    pipeline = pipeline.resize(width, height, {
      fit,
      withoutEnlargement: false,
    });

    // Set output format and quality
    switch (format.toLowerCase()) {
      case 'png':
        pipeline = pipeline.png({ quality: Math.min(100, Math.max(1, quality)) });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: Math.min(100, Math.max(1, quality)) });
        break;
      case 'jpeg':
      case 'jpg':
      default:
        pipeline = pipeline.jpeg({ quality: Math.min(100, Math.max(1, quality)) });
        break;
    }

    const buffer = await pipeline.toBuffer();

    const mimeType = format.toLowerCase() === 'jpg' ? 'jpeg' : format.toLowerCase();
    const dataUrl = `data:image/${mimeType};base64,${buffer.toString('base64')}`;

    return { success: true, dataUrl };
  } catch (error) {
    console.error('[CropImage] Error resizing image:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Generate thumbnail for an image file (convenience function)
 * @param {string} filePath - Path to the image file
 * @param {Object} options - Thumbnail options
 * @param {number} [options.maxWidth=400] - Maximum width
 * @param {number} [options.maxHeight=400] - Maximum height
 * @param {number} [options.quality=80] - Output quality
 * @param {string} [options.format='jpeg'] - Output format
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function generateThumbnail(filePath, options = {}) {
  const { maxWidth = 400, maxHeight = 400, quality = 80, format = 'jpeg' } = options;

  return resizeImage(filePath, {
    width: maxWidth,
    height: maxHeight,
    fit: 'inside',
    format,
    quality,
  });
}

/**
 * Get image metadata
 * @param {string} filePath - Path to the image file
 * @returns {Promise<{success: boolean, metadata?: Object, error?: string}>}
 */
async function getImageMetadata(filePath) {
  if (!sharp) {
    return { success: false, error: 'Sharp not available' };
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found' };
  }

  try {
    const metadata = await sharp(filePath).metadata();
    return {
      success: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        space: metadata.space,
        channels: metadata.channels,
        depth: metadata.depth,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
      },
    };
  } catch (error) {
    console.error('[CropImage] Error getting image metadata:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  isAvailable,
  cropImage,
  resizeImage,
  generateThumbnail,
  getImageMetadata,
};
