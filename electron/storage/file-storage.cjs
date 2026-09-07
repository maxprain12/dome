/** Storage root and file metadata utilities. Resource I/O belongs to vault-store. */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { app } = require('electron');

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

function getStorageDir() {
  return path.join(app.getPath('userData'), 'dome-files');
}
function getMimeType(ext) {
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}
function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function classifyFileType(ext, providedType) {
  const e = (ext || '').toLowerCase().replace(/^\.?/, '.');
  if (e === '.url') return 'url';
  if (e === '.dnb') return 'notebook';
  if (['.xlsx', '.xls', '.csv'].includes(e)) return 'excel';
  if (['.pptx', '.ppt'].includes(e)) return 'ppt';
  if (['.docx', '.doc'].includes(e)) return 'document';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(e)) return 'image';
  if (e === '.pdf') return 'pdf';
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(e)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(e)) return 'audio';
  return providedType || 'document';
}

function getStorageUsage(database) {
  const vault = require('./vault-store.cjs');
  const queries = database.getQueries();
  const usage = { total: 0, byType: {}, fileCount: 0 };
  const seen = new Set();
  for (const resource of database.getDB().prepare("SELECT project_id,vault_path,type FROM resources WHERE vault_path IS NOT NULL AND type != 'folder'").all()) {
    const filename = vault.getResourceFilePath(resource, queries, module.exports);
    if (seen.has(filename)) continue;
    seen.add(filename);
    try {
      const stat = fs.statSync(filename);
      if (!stat.isFile()) continue;
      usage.total += stat.size;
      usage.byType[resource.type] = (usage.byType[resource.type] || 0) + stat.size;
      usage.fileCount++;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return usage;
}
function initStorage() {
  fs.mkdirSync(getStorageDir(), { recursive: true });
}
module.exports = { getStorageDir, getMimeType, calculateHash, classifyFileType, getStorageUsage, initStorage };
