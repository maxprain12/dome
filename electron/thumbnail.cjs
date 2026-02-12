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

// @napi-rs/canvas for real PDF page rendering (optional)
let napiCanvas = null;
let napiCanvasLoadAttempted = false;

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
 * Uses pdfjs-dist + @napi-rs/canvas for actual page render, fallback to SVG placeholder
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string|null>} Base64 data URL or null
 */
async function generatePdfThumbnail(filePath) {
  if (!sharp) {
    console.warn('[Thumbnail] sharp not available, falling back to SVG placeholder');
    return generatePdfPlaceholder(filePath);
  }

  // Lazy-load @napi-rs/canvas for real rendering
  if (!napiCanvas && !napiCanvasLoadAttempted) {
    napiCanvasLoadAttempted = true;
    try {
      napiCanvas = require('@napi-rs/canvas');
      console.log('[Thumbnail] @napi-rs/canvas loaded for PDF page rendering');
    } catch (error) {
      console.warn('[Thumbnail] @napi-rs/canvas not available, PDF thumbnails will use placeholders:', error.message);
    }
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
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: true,
    });

    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);

    const viewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(
      THUMBNAIL_CONFIG.maxWidth / viewport.width,
      THUMBNAIL_CONFIG.maxHeight / viewport.height
    );
    const scaledViewport = page.getViewport({ scale });
    const width = Math.floor(scaledViewport.width);
    const height = Math.floor(scaledViewport.height);

    // Try real render with @napi-rs/canvas
    if (napiCanvas && napiCanvas.createCanvas) {
      try {
        const canvas = napiCanvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const renderContext = {
          canvasContext: ctx,
          viewport: scaledViewport,
          canvasFactory: {
            create(w, h) {
              const c = napiCanvas.createCanvas(w, h);
              return { canvas: c, context: c.getContext('2d') };
            },
            reset(canvasAndContext, w, h) {
              if (canvasAndContext.canvas) {
                canvasAndContext.canvas.width = w;
                canvasAndContext.canvas.height = h;
              }
            },
            destroy(canvasAndContext) {
              canvasAndContext.canvas = null;
              canvasAndContext.context = null;
            },
          },
        };

        await page.render(renderContext).promise;
        pdfDoc.destroy();

        const pngBuffer = await canvas.encode('png');
        const jpegBuffer = await sharp(pngBuffer)
          .resize(THUMBNAIL_CONFIG.maxWidth, THUMBNAIL_CONFIG.maxHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: THUMBNAIL_CONFIG.quality })
          .toBuffer();

        return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
      } catch (renderError) {
        console.warn('[Thumbnail] PDF real render failed, using placeholder:', renderError.message);
      }
    }

    pdfDoc.destroy();

    // Fallback: placeholder limpio (icono PDF) en lugar del SVG con texto denso
    return generatePdfPlaceholder(filePath);
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
