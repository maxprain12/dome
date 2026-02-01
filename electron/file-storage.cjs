/* eslint-disable no-console */
/**
 * File Storage Module - Main Process
 * Handles internal file storage for Dome
 * Files are copied to userData/dome-files/ and managed independently
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');

const DOME_FILES_DIR = 'dome-files';

// Type to directory mapping
const TYPE_DIRECTORIES = {
  image: 'images',
  pdf: 'pdfs',
  video: 'videos',
  audio: 'audio',
  document: 'documents',
  note: 'notes',
  url: 'urls',
};

// MIME type mapping
const MIME_TYPES = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  // PDFs
  '.pdf': 'application/pdf',
  // Videos
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  // Documents
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.rtf': 'application/rtf',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
};

/**
 * Get the base storage directory
 * @returns {string} Absolute path to dome-files directory
 */
function getStorageDir() {
  return path.join(app.getPath('userData'), DOME_FILES_DIR);
}

/**
 * Get the directory name for a resource type
 * @param {string} type - Resource type
 * @returns {string} Directory name
 */
function getTypeDir(type) {
  return TYPE_DIRECTORIES[type] || 'documents';
}

/**
 * Get MIME type from file extension
 * @param {string} ext - File extension (with dot)
 * @returns {string} MIME type
 */
function getMimeType(ext) {
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Calculate SHA-256 hash of a buffer (first 16 chars)
 * @param {Buffer} buffer - File content buffer
 * @returns {string} 16-character hash
 */
function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/**
 * Ensure a directory exists
 * @param {string} dirPath - Directory path
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Import a file to internal storage
 * @param {string} filePath - Original file path
 * @param {string} type - Resource type (image, pdf, video, etc.)
 * @returns {Promise<{internalPath: string, hash: string, size: number, mimeType: string, originalName: string}>}
 */
async function importFile(filePath, type) {
  // Validate file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Read file
  const buffer = fs.readFileSync(filePath);
  const hash = calculateHash(buffer);
  const ext = path.extname(filePath).toLowerCase();
  const originalName = path.basename(filePath);
  const typeDir = getTypeDir(type);
  const internalPath = `${typeDir}/${hash}${ext}`;
  const fullPath = path.join(getStorageDir(), internalPath);

  // Ensure directory exists
  ensureDir(path.dirname(fullPath));

  // Copy file (only if doesn't exist - deduplication)
  if (!fs.existsSync(fullPath)) {
    fs.copyFileSync(filePath, fullPath);
    console.log(`[FileStorage] Imported: ${originalName} -> ${internalPath}`);
  } else {
    console.log(`[FileStorage] File already exists (dedup): ${internalPath}`);
  }

  return {
    internalPath,
    hash,
    size: buffer.length,
    mimeType: getMimeType(ext),
    originalName,
  };
}

/**
 * Import a file from buffer (for downloads, clipboard, etc.)
 * @param {Buffer} buffer - File content
 * @param {string} filename - Original filename
 * @param {string} type - Resource type
 * @returns {Promise<{internalPath: string, hash: string, size: number, mimeType: string, originalName: string}>}
 */
async function importFromBuffer(buffer, filename, type) {
  const hash = calculateHash(buffer);
  const ext = path.extname(filename).toLowerCase();
  const typeDir = getTypeDir(type);
  const internalPath = `${typeDir}/${hash}${ext}`;
  const fullPath = path.join(getStorageDir(), internalPath);

  // Ensure directory exists
  ensureDir(path.dirname(fullPath));

  // Write file (only if doesn't exist - deduplication)
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, buffer);
    console.log(`[FileStorage] Saved from buffer: ${filename} -> ${internalPath}`);
  } else {
    console.log(`[FileStorage] File already exists (dedup): ${internalPath}`);
  }

  return {
    internalPath,
    hash,
    size: buffer.length,
    mimeType: getMimeType(ext),
    originalName: filename,
  };
}

/**
 * Get the full absolute path for an internal path
 * @param {string} internalPath - Relative path within dome-files
 * @returns {string} Full absolute path
 */
function getFullPath(internalPath) {
  if (!internalPath) return null;
  return path.join(getStorageDir(), internalPath);
}

/**
 * Check if a file exists in internal storage
 * @param {string} internalPath - Relative path within dome-files
 * @returns {boolean}
 */
function fileExists(internalPath) {
  if (!internalPath) return false;
  const fullPath = getFullPath(internalPath);
  return fs.existsSync(fullPath);
}

/**
 * Read a file from internal storage
 * @param {string} internalPath - Relative path within dome-files
 * @returns {Buffer|null}
 */
function readFile(internalPath) {
  if (!internalPath) return null;
  const fullPath = getFullPath(internalPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

/**
 * Read a file as Base64 data URL
 * @param {string} internalPath - Relative path within dome-files
 * @returns {string|null} Data URL (data:mime/type;base64,...)
 */
function readFileAsDataUrl(internalPath) {
  if (!internalPath) return null;
  const buffer = readFile(internalPath);
  if (!buffer) return null;

  const ext = path.extname(internalPath).toLowerCase();
  const mimeType = getMimeType(ext);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Delete a file from internal storage
 * @param {string} internalPath - Relative path within dome-files
 * @returns {boolean} True if deleted, false if not found
 */
function deleteFile(internalPath) {
  if (!internalPath) return false;
  const fullPath = getFullPath(internalPath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log(`[FileStorage] Deleted: ${internalPath}`);
    return true;
  }
  return false;
}

/**
 * Export a file from internal storage to a destination
 * @param {string} internalPath - Relative path within dome-files
 * @param {string} destinationPath - Full path to export to
 * @returns {boolean} True if exported successfully
 */
function exportFile(internalPath, destinationPath) {
  if (!internalPath) return false;
  const fullPath = getFullPath(internalPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Internal file not found: ${internalPath}`);
  }

  // Ensure destination directory exists
  ensureDir(path.dirname(destinationPath));

  // Copy file
  fs.copyFileSync(fullPath, destinationPath);
  console.log(`[FileStorage] Exported: ${internalPath} -> ${destinationPath}`);
  return true;
}

/**
 * Get storage usage statistics
 * @returns {{total: number, byType: Record<string, number>, fileCount: number}}
 */
function getStorageUsage() {
  const storageDir = getStorageDir();
  const usage = {
    total: 0,
    byType: {},
    fileCount: 0,
  };

  // Initialize type directories
  Object.values(TYPE_DIRECTORIES).forEach((dir) => {
    usage.byType[dir] = 0;
  });

  // Calculate usage for each type directory
  Object.values(TYPE_DIRECTORIES).forEach((typeDir) => {
    const typePath = path.join(storageDir, typeDir);
    if (fs.existsSync(typePath)) {
      const files = fs.readdirSync(typePath);
      files.forEach((file) => {
        const filePath = path.join(typePath, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          usage.total += stats.size;
          usage.byType[typeDir] += stats.size;
          usage.fileCount++;
        }
      });
    }
  });

  return usage;
}

/**
 * Clean up orphaned files (files not in database) and old avatars
 * @param {string[]} validInternalPaths - Array of valid internal paths from database
 * @param {string|null} currentAvatarPath - Current avatar path from settings (e.g., 'avatars/user-avatar-123.jpg')
 * @returns {{deleted: number, freedBytes: number}}
 */
function cleanupOrphanedFiles(validInternalPaths, currentAvatarPath = null) {
  const storageDir = getStorageDir();
  const validSet = new Set(validInternalPaths);
  let deleted = 0;
  let freedBytes = 0;

  // Cleanup dome-files/ orphans
  Object.values(TYPE_DIRECTORIES).forEach((typeDir) => {
    const typePath = path.join(storageDir, typeDir);
    if (fs.existsSync(typePath)) {
      const files = fs.readdirSync(typePath);
      files.forEach((file) => {
        const internalPath = `${typeDir}/${file}`;
        if (!validSet.has(internalPath)) {
          const fullPath = path.join(typePath, file);
          try {
            const stats = fs.statSync(fullPath);
            fs.unlinkSync(fullPath);
            deleted++;
            freedBytes += stats.size;
            console.log(`[FileStorage] Cleaned up orphaned: ${internalPath}`);
          } catch (error) {
            console.error(`[FileStorage] Error deleting ${internalPath}:`, error.message);
          }
        }
      });
    }
  });

  // Cleanup orphaned avatars
  const avatarsDir = path.join(require('electron').app.getPath('userData'), 'avatars');
  if (fs.existsSync(avatarsDir)) {
    const avatarFiles = fs.readdirSync(avatarsDir);
    avatarFiles.forEach((file) => {
      const relativePath = `avatars/${file}`;

      // Keep only the current avatar
      if (relativePath !== currentAvatarPath) {
        const fullPath = path.join(avatarsDir, file);
        try {
          const stats = fs.statSync(fullPath);
          fs.unlinkSync(fullPath);
          deleted++;
          freedBytes += stats.size;
          console.log(`[FileStorage] Cleaned up orphaned avatar: ${relativePath}`);
        } catch (error) {
          console.error(`[FileStorage] Error deleting avatar ${relativePath}:`, error.message);
        }
      }
    });
  }

  return { deleted, freedBytes };
}

/**
 * Initialize storage directories
 */
function initStorage() {
  const storageDir = getStorageDir();
  ensureDir(storageDir);

  // Create all type directories
  Object.values(TYPE_DIRECTORIES).forEach((typeDir) => {
    ensureDir(path.join(storageDir, typeDir));
  });

  console.log('[FileStorage] Storage initialized at:', storageDir);
}

module.exports = {
  getStorageDir,
  getTypeDir,
  getMimeType,
  calculateHash,
  importFile,
  importFromBuffer,
  getFullPath,
  fileExists,
  readFile,
  readFileAsDataUrl,
  deleteFile,
  exportFile,
  getStorageUsage,
  cleanupOrphanedFiles,
  initStorage,
};
