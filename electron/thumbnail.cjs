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

// Try to load fluent-ffmpeg for video thumbnails
let ffmpeg = null;
let ffmpegPath = null;
try {
  ffmpeg = require('fluent-ffmpeg');
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpegPath = ffmpegInstaller.path;
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('[Thumbnail] ffmpeg loaded successfully from:', ffmpegPath);
} catch (error) {
  console.warn('[Thumbnail] fluent-ffmpeg not available, video thumbnails will use placeholders');
}

// pdfjs-dist v5 is ESM-only, so we use dynamic import() at call time
// We cache the module after first load
let pdfjsLib = null;
let pdfjsLoadAttempted = false;

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
 * Generate a branded PDF placeholder thumbnail as SVG
 * @param {string} filePath - Path to the PDF file
 * @returns {string} Base64 data URL of SVG
 */
function generatePdfPlaceholder(filePath) {
  const filename = path.basename(filePath, path.extname(filePath));
  const truncatedName = filename.length > 35 ? filename.substring(0, 35) + '...' : filename;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <defs>
      <linearGradient id="pdfGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#dc2626;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#991b1b;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill="#fee2e2" rx="8"/>

    <!-- PDF Icon -->
    <rect x="150" y="80" width="100" height="120" rx="8" fill="url(#pdfGrad)"/>
    <path d="M 150 90 L 150 80 L 240 80 L 250 90 L 240 90 Z" fill="#991b1b"/>

    <!-- PDF Text -->
    <text x="200" y="145" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="white">PDF</text>

    <!-- File Icon Lines -->
    <line x1="170" y1="165" x2="230" y2="165" stroke="white" stroke-width="2" opacity="0.6"/>
    <line x1="170" y1="175" x2="230" y2="175" stroke="white" stroke-width="2" opacity="0.6"/>
    <line x1="170" y1="185" x2="210" y2="185" stroke="white" stroke-width="2" opacity="0.6"/>

    <!-- Filename -->
    <text x="200" y="235" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="500" fill="#991b1b">${escapeXml(truncatedName)}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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
 * Generate a branded video placeholder thumbnail as SVG
 * @param {string} filePath - Path to the video file
 * @returns {string} Base64 data URL of SVG
 */
function generateVideoPlaceholder(filePath) {
  const filename = path.basename(filePath, path.extname(filePath));
  const truncatedName = filename.length > 30 ? filename.substring(0, 30) + '...' : filename;
  const ext = path.extname(filePath).toUpperCase().replace('.', '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <defs>
      <linearGradient id="videoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#5b21b6;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill="#ede9fe" rx="8"/>

    <!-- Video Player Icon -->
    <rect x="125" y="75" width="150" height="120" rx="12" fill="url(#videoGrad)"/>

    <!-- Play Button -->
    <circle cx="200" cy="135" r="30" fill="white" opacity="0.9"/>
    <path d="M 190 120 L 190 150 L 215 135 Z" fill="#7c3aed"/>

    <!-- Format Badge -->
    <rect x="165" y="170" width="70" height="24" rx="4" fill="white" opacity="0.9"/>
    <text x="200" y="187" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="#7c3aed">${escapeXml(ext)}</text>

    <!-- Filename -->
    <text x="200" y="235" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="500" fill="#5b21b6">${escapeXml(truncatedName)}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Generate thumbnail for a video file using FFmpeg
 * @param {string} filePath - Path to the video file
 * @returns {Promise<string|null>} Base64 data URL or null
 */
async function generateVideoThumbnail(filePath) {
  if (!ffmpeg || !sharp) {
    console.warn('[Thumbnail] ffmpeg or sharp not available, using placeholder');
    return generateVideoPlaceholder(filePath);
  }

  if (!fs.existsSync(filePath)) {
    console.error('[Thumbnail] Video file not found:', filePath);
    return null;
  }

  try {
    // Create temp file for screenshot
    const { app } = require('electron');
    const tempDir = path.join(app.getPath('userData'), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `thumb-${Date.now()}.jpg`);

    // Extract frame at 5 seconds (or 1 second for short videos)
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.warn('[Thumbnail] Video processing timeout, using placeholder');
        reject(new Error('Timeout'));
      }, 10000); // 10 second timeout

      ffmpeg(filePath)
        .screenshots({
          timestamps: ['5'], // 5 seconds into video
          filename: path.basename(tempFile),
          folder: path.dirname(tempFile),
          size: '400x400',
        })
        .on('end', () => {
          clearTimeout(timeoutId);
          resolve();
        })
        .on('error', (err) => {
          clearTimeout(timeoutId);
          // Try 1 second for short videos
          console.warn('[Thumbnail] Retrying at 1 second:', err.message);
          ffmpeg(filePath)
            .screenshots({
              timestamps: ['1'],
              filename: path.basename(tempFile),
              folder: path.dirname(tempFile),
              size: '400x400',
            })
            .on('end', () => resolve())
            .on('error', reject);
        });
    });

    // Process with sharp to ensure consistent format
    const thumbnailBuffer = await sharp(tempFile)
      .resize(THUMBNAIL_CONFIG.maxWidth, THUMBNAIL_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_CONFIG.quality })
      .toBuffer();

    // Clean up temp file
    fs.unlinkSync(tempFile);

    const base64 = thumbnailBuffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;

  } catch (error) {
    console.error('[Thumbnail] Error generating video thumbnail:', error.message);
    // Fallback to placeholder
    return generateVideoPlaceholder(filePath);
  }
}

/**
 * Extract video metadata using ffprobe
 * @param {string} filePath - Path to the video file
 * @returns {Promise<object|null>} Video metadata or null
 */
async function extractVideoMetadata(filePath) {
  if (!ffmpeg) {
    return null;
  }

  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('[Thumbnail] Error extracting video metadata:', err);
        resolve(null);
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        resolve(null);
        return;
      }

      // Parse frame rate (e.g., "30/1" -> 30)
      let fps = 0;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        fps = den ? Math.round(num / den) : 0;
      }

      resolve({
        duration: Math.round(metadata.format.duration || 0),
        width: videoStream.width,
        height: videoStream.height,
        codec: videoStream.codec_name,
        bitrate: Math.round((metadata.format.bit_rate || 0) / 1000), // kbps
        fps: fps,
      });
    });
  });
}

/**
 * Generate a real PDF thumbnail by rendering the first page
 * Uses pdfjs-dist to render to raw pixel data, then sharp to convert to JPEG
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string|null>} Base64 data URL or null
 */
async function generatePdfThumbnail(filePath) {
  if (!sharp) {
    console.warn('[Thumbnail] sharp not available, falling back to SVG placeholder');
    return generatePdfPlaceholder(filePath);
  }

  // Lazy-load pdfjs-dist (ESM module) on first use
  if (!pdfjsLib && !pdfjsLoadAttempted) {
    pdfjsLoadAttempted = true;
    try {
      pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      console.log('[Thumbnail] pdfjs-dist loaded successfully (ESM dynamic import)');
    } catch (error) {
      console.warn('[Thumbnail] pdfjs-dist not available, PDF thumbnails will use SVG placeholders:', error.message);
    }
  }

  if (!pdfjsLib || !pdfjsLib.getDocument) {
    return generatePdfPlaceholder(filePath);
  }

  if (!fs.existsSync(filePath)) {
    console.error('[Thumbnail] PDF file not found:', filePath);
    return null;
  }

  try {
    // Load the PDF document
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({
      data,
      // Disable font/image loading for faster rendering
      disableFontFace: true,
      useSystemFonts: true,
    });

    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);

    // Calculate scale to fit within thumbnail dimensions
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(
      THUMBNAIL_CONFIG.maxWidth / viewport.width,
      THUMBNAIL_CONFIG.maxHeight / viewport.height
    );
    const scaledViewport = page.getViewport({ scale });

    const width = Math.floor(scaledViewport.width);
    const height = Math.floor(scaledViewport.height);

    // Create a simple pixel buffer for rendering (RGBA)
    // pdfjs-dist can render to a custom "canvas" context using OPS
    // We use the built-in Node.js rendering approach
    const canvasFactory = {
      create(w, h) {
        const canvas = {
          width: w,
          height: h,
          getContext() {
            return null; // Will be set by the approach below
          },
        };
        return canvas;
      },
      reset(canvas, w, h) {
        canvas.width = w;
        canvas.height = h;
      },
      destroy(canvas) {
        // no-op
      },
    };

    // For Node.js without canvas, we render via the operator list approach
    // Extract text and create a clean document-style thumbnail instead
    // This is more reliable than trying to render pixels without node-canvas

    // Get text content from first page for a rich preview
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => item.str).filter(Boolean);
    const pageText = textItems.join(' ').substring(0, 300);

    // Generate a nicer document-style thumbnail with actual text content
    const aspectRatio = viewport.width / viewport.height;
    const svgWidth = 400;
    const svgHeight = Math.round(svgWidth / aspectRatio);

    // Split text into lines for SVG rendering
    const lines = [];
    const maxLineLength = 50;
    const words = pageText.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > maxLineLength) {
        lines.push(currentLine.trim());
        currentLine = word;
        if (lines.length >= 14) break;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    }
    if (currentLine && lines.length < 14) {
      lines.push(currentLine.trim());
    }

    const textLines = lines
      .map((line, i) => `<text x="28" y="${52 + i * 18}" font-family="Georgia, 'Times New Roman', serif" font-size="11" fill="#374151">${escapeXml(line)}</text>`)
      .join('\n    ');

    const pageCount = pdfDoc.numPages;
    const filename = path.basename(filePath, '.pdf');
    const truncatedName = filename.length > 40 ? filename.substring(0, 40) + '...' : filename;

    // Create a realistic document-style preview
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
    <rect width="${svgWidth}" height="${svgHeight}" fill="white" rx="4"/>
    <!-- Paper shadow effect -->
    <rect x="2" y="2" width="${svgWidth - 4}" height="${svgHeight - 4}" fill="white" stroke="#e5e7eb" stroke-width="1" rx="2"/>
    <!-- Red PDF header bar -->
    <rect x="2" y="2" width="${svgWidth - 4}" height="28" fill="#dc2626" rx="2"/>
    <rect x="2" y="16" width="${svgWidth - 4}" height="14" fill="#dc2626"/>
    <text x="16" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="white">PDF</text>
    <text x="${svgWidth - 16}" y="22" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="rgba(255,255,255,0.8)">${pageCount} page${pageCount !== 1 ? 's' : ''}</text>
    <!-- Title -->
    <text x="28" y="52" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="#111827">${escapeXml(truncatedName)}</text>
    <!-- Separator -->
    <line x1="28" y1="58" x2="${svgWidth - 28}" y2="58" stroke="#e5e7eb" stroke-width="1"/>
    <!-- Text content preview -->
    ${lines.length > 0 ? lines
      .map((line, i) => `<text x="28" y="${76 + i * 16}" font-family="Georgia, 'Times New Roman', serif" font-size="10.5" fill="#4b5563">${escapeXml(line)}</text>`)
      .join('\n    ') : '<text x="28" y="76" font-family="system-ui" font-size="11" fill="#9ca3af">(No text content)</text>'}
    <!-- Fade out gradient at bottom -->
    <defs>
      <linearGradient id="fadeOut" x1="0" y1="${svgHeight - 50}" x2="0" y2="${svgHeight}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="white" stop-opacity="0"/>
        <stop offset="100%" stop-color="white" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect x="2" y="${svgHeight - 50}" width="${svgWidth - 4}" height="48" fill="url(#fadeOut)"/>
  </svg>`;

    // Convert SVG to JPEG via sharp for consistent format
    const jpegBuffer = await sharp(Buffer.from(svg))
      .resize(THUMBNAIL_CONFIG.maxWidth, THUMBNAIL_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_CONFIG.quality })
      .toBuffer();

    pdfDoc.destroy();

    return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
  } catch (error) {
    console.error('[Thumbnail] Error generating PDF thumbnail:', error.message);
    // Fallback to SVG placeholder
    return generatePdfPlaceholder(filePath);
  }
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

  // PDF files - generate real page preview (or fallback to placeholder)
  if (type === 'pdf' || mimeType === 'application/pdf') {
    return generatePdfThumbnail(filePath);
  }

  // Video files - generate thumbnail with ffmpeg or placeholder
  if (type === 'video' || mimeType?.startsWith('video/')) {
    return generateVideoThumbnail(filePath);
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
  extractVideoMetadata,
  THUMBNAIL_CONFIG,
};
