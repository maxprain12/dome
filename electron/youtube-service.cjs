/* eslint-disable no-console */
/**
 * YouTube Service Module - Main Process
 * Handles YouTube video thumbnail extraction and metadata
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

/**
 * Extract video ID from various YouTube URL formats
 * @param {string} url - YouTube URL
 * @returns {string|null} Video ID or null
 */
function extractVideoId(url) {
  try {
    const urlObj = new URL(url);
    
    // Format: https://www.youtube.com/watch?v=VIDEO_ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
      return urlObj.searchParams.get('v');
    }
    
    // Format: https://youtu.be/VIDEO_ID
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1);
    }
    
    // Format: https://www.youtube.com/embed/VIDEO_ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname.startsWith('/embed/')) {
      return urlObj.pathname.split('/embed/')[1]?.split('?')[0];
    }
    
    // Format: https://www.youtube.com/v/VIDEO_ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname.startsWith('/v/')) {
      return urlObj.pathname.split('/v/')[1]?.split('?')[0];
    }
    
    return null;
  } catch (error) {
    console.error('[YouTubeService] Error extracting video ID:', error);
    return null;
  }
}

/**
 * Download a file from URL
 * @param {string} url - URL to download from
 * @returns {Promise<Buffer>} File buffer
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Get YouTube thumbnail URL
 * @param {string} videoId - YouTube video ID
 * @param {string} quality - Thumbnail quality: 'maxresdefault' | 'hqdefault' | 'mqdefault' | 'sddefault'
 * @returns {string} Thumbnail URL
 */
function getThumbnailUrl(videoId, quality = 'maxresdefault') {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Download YouTube thumbnail
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Buffer|null>} Thumbnail buffer or null if failed
 */
async function downloadThumbnail(videoId) {
  // Try maxresdefault first (highest quality)
  const qualities = ['maxresdefault', 'hqdefault', 'mqdefault', 'sddefault'];
  
  for (const quality of qualities) {
    try {
      const url = getThumbnailUrl(videoId, quality);
      console.log(`[YouTubeService] Trying thumbnail: ${url}`);
      const buffer = await downloadFile(url);
      
      // Check if it's a valid image (not the default "video unavailable" image)
      // The default image is usually very small (< 5KB)
      if (buffer.length > 5000) {
        console.log(`[YouTubeService] Successfully downloaded thumbnail (${quality})`);
        return buffer;
      }
    } catch (error) {
      console.log(`[YouTubeService] Failed to download ${quality}:`, error.message);
      // Try next quality
    }
  }
  
  return null;
}

/**
 * Save thumbnail to internal storage
 * @param {Buffer} thumbnailBuffer - Thumbnail image buffer
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<{internalPath: string, hash: string, size: number}>}
 */
async function saveThumbnail(thumbnailBuffer, videoId) {
  const userDataPath = app.getPath('userData');
  const domeFilesPath = path.join(userDataPath, 'dome-files');
  const screenshotsPath = path.join(domeFilesPath, 'screenshots');
  const youtubePath = path.join(screenshotsPath, 'youtube');
  
  // Ensure directories exist
  if (!fs.existsSync(youtubePath)) {
    fs.mkdirSync(youtubePath, { recursive: true });
  }
  
  // Calculate hash for deduplication
  const hash = crypto.createHash('sha256').update(thumbnailBuffer).digest('hex').slice(0, 16);
  const filename = `${videoId}_${hash}.jpg`;
  const fullPath = path.join(youtubePath, filename);
  const internalPath = `screenshots/youtube/${filename}`;
  
  // Save file (only if doesn't exist)
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, thumbnailBuffer);
    console.log(`[YouTubeService] Saved thumbnail: ${internalPath}`);
  } else {
    console.log(`[YouTubeService] Thumbnail already exists: ${internalPath}`);
  }
  
  return {
    internalPath,
    hash,
    size: thumbnailBuffer.length
  };
}

/**
 * Get YouTube video thumbnail and save it
 * @param {string} url - YouTube URL
 * @returns {Promise<object>} Result with thumbnail data
 */
async function getYouTubeThumbnail(url) {
  try {
    const videoId = extractVideoId(url);
    
    if (!videoId) {
      return {
        success: false,
        error: 'Invalid YouTube URL',
        videoId: null,
        thumbnail: null
      };
    }
    
    console.log(`[YouTubeService] Processing YouTube video: ${videoId}`);
    
    // Download thumbnail
    const thumbnailBuffer = await downloadThumbnail(videoId);
    
    if (!thumbnailBuffer) {
      return {
        success: false,
        error: 'Failed to download thumbnail',
        videoId,
        thumbnail: null
      };
    }
    
    // Save to internal storage
    const saved = await saveThumbnail(thumbnailBuffer, videoId);
    
    // Convert to Base64 data URL for thumbnail_data
    const dataUrl = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
    
    return {
      success: true,
      videoId,
      thumbnail: {
        internalPath: saved.internalPath,
        hash: saved.hash,
        size: saved.size,
        dataUrl
      },
      metadata: {
        url,
        video_id: videoId
      }
    };
    
  } catch (error) {
    console.error('[YouTubeService] Error getting YouTube thumbnail:', error);
    return {
      success: false,
      error: error.message,
      videoId: null,
      thumbnail: null
    };
  }
}

module.exports = {
  extractVideoId,
  getYouTubeThumbnail,
  getThumbnailUrl
};
