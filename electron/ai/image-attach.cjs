'use strict';

const sharp = require('sharp');
const { parseDataUrl, resolveModelCapabilities } = require('./message-multimodal.cjs');

const MAX_WIDTH = 2000;
const MAX_HEIGHT = 2000;
/** Headroom below Anthropic's 5MB inline limit. */
const MAX_BASE64_BYTES = 4.5 * 1024 * 1024;

/**
 * @param {Buffer} input
 * @param {string} mimeType
 * @returns {Promise<{ data: string, mimeType: string, wasResized: boolean, originalWidth: number, originalHeight: number, width: number, height: number } | null>}
 */
async function resizeImageBuffer(input, mimeType) {
  try {
    const meta = await sharp(input).metadata();
    const originalWidth = meta.width || 0;
    const originalHeight = meta.height || 0;
    if (!originalWidth || !originalHeight) return null;

    let pipeline = sharp(input).rotate();
    if (originalWidth > MAX_WIDTH || originalHeight > MAX_HEIGHT) {
      pipeline = pipeline.resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true });
    }

    const jpegQualities = [80, 70, 55, 40];
    const attempts = [];

    const pngBuf = await pipeline.clone().png().toBuffer();
    attempts.push({ buffer: pngBuf, mimeType: 'image/png' });

    for (const q of jpegQualities) {
      attempts.push({
        buffer: await pipeline.clone().jpeg({ quality: q }).toBuffer(),
        mimeType: 'image/jpeg',
      });
    }

    let best = null;
    for (const attempt of attempts) {
      const data = attempt.buffer.toString('base64');
      const encodedSize = Buffer.byteLength(data, 'utf8');
      if (encodedSize >= MAX_BASE64_BYTES) continue;
      if (!best || encodedSize < best.encodedSize) {
        const outMeta = await sharp(attempt.buffer).metadata();
        best = {
          data,
          mimeType: attempt.mimeType,
          encodedSize,
          width: outMeta.width || originalWidth,
          height: outMeta.height || originalHeight,
        };
      }
    }

    if (!best) return null;

    const wasResized =
      best.width !== originalWidth ||
      best.height !== originalHeight ||
      best.mimeType !== mimeType;

    return {
      data: best.data,
      mimeType: best.mimeType,
      wasResized,
      originalWidth,
      originalHeight,
      width: best.width,
      height: best.height,
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ dataUrl: string, mime?: string, name?: string }} image
 * @returns {Promise<{ type: 'image', mimeType: string, data: string } | null>}
 */
async function dataUrlToImageContent(image) {
  const parsed = parseDataUrl(String(image.dataUrl || ''));
  if (!parsed) return null;

  const input = Buffer.from(parsed.data, 'base64');
  const resized = await resizeImageBuffer(input, parsed.mediaType);
  if (!resized) return null;

  return {
    type: 'image',
    mimeType: resized.mimeType,
    data: resized.data,
  };
}

/**
 * Convert structured chat attachments to PI ImageContent blocks.
 * @param {{ images?: Array<{ dataUrl: string, mime?: string, name?: string }> } | undefined} attachments
 * @param {{ provider?: string, modelId?: string }} opts
 * @returns {Promise<Array<{ type: 'image', mimeType: string, data: string }>>}
 */
async function attachmentsToImageContent(attachments, opts = {}) {
  const caps = resolveModelCapabilities(opts.provider, opts.modelId);
  if (!caps.supportsImage) return [];

  const images = attachments?.images;
  if (!Array.isArray(images) || images.length === 0) return [];

  const out = [];
  for (const img of images) {
    const block = await dataUrlToImageContent(img);
    if (block) out.push(block);
  }
  return out;
}

module.exports = {
  resizeImageBuffer,
  dataUrlToImageContent,
  attachmentsToImageContent,
};
