/* eslint-disable no-console */
/**
 * Security Module - Main Process
 * Provides centralized security validation functions for IPC handlers
 */

const path = require('path');
const { app } = require('electron');

/**
 * Validates that the IPC event sender is authorized
 * @param {Electron.IpcMainInvokeEvent} event - IPC event
 * @param {Object} windowManager - Window manager instance
 * @throws {Error} If sender is not authorized
 */
function validateSender(event, windowManager) {
  if (!windowManager || !windowManager.isAuthorized) {
    throw new Error('WindowManager not available');
  }

  if (!windowManager.isAuthorized(event.sender.id)) {
    throw new Error('Unauthorized sender');
  }
}

/**
 * Gets allowed paths for file operations
 * @returns {string[]} Array of allowed base paths
 */
function getAllowedPaths() {
  const userDataPath = app.getPath('userData');
  const domeFilesPath = path.join(userDataPath, 'dome-files');
  
  return [
    userDataPath,
    domeFilesPath,
    // Allow subdirectories within userData
    path.join(userDataPath, 'avatars'),
    path.join(userDataPath, 'logs'),
  ];
}

/**
 * Sanitizes and validates a file path
 * Ensures the path is within allowed directories and prevents path traversal
 * @param {string} filePath - File path to sanitize
 * @param {boolean} allowExternal - If true, allows paths outside userData (for open-path)
 * @returns {string} Normalized and validated path
 * @throws {Error} If path is not allowed or contains dangerous patterns
 */
function sanitizePath(filePath, allowExternal = false) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid path: must be a non-empty string');
  }

  // Normalize the path
  const normalized = path.normalize(filePath);

  // Check for path traversal attempts
  if (normalized.includes('..')) {
    throw new Error('Path traversal detected: path contains ".."');
  }

  // If allowExternal is true, only check for dangerous patterns
  // This is for operations like shell.openPath where we might open external files
  if (allowExternal) {
    // Still prevent null bytes and other dangerous characters
    if (normalized.includes('\0')) {
      throw new Error('Path contains null byte');
    }
    return normalized;
  }

  // For internal operations, validate against allowed paths
  const allowedPaths = getAllowedPaths();
  const isAllowed = allowedPaths.some(allowed => {
    // Use path.resolve to handle relative paths correctly
    const resolved = path.resolve(normalized);
    const resolvedAllowed = path.resolve(allowed);
    return resolved.startsWith(resolvedAllowed);
  });

  if (!isAllowed) {
    throw new Error(`Path not allowed: ${normalized} must be within userData directory`);
  }

  return normalized;
}

/**
 * Validates a URL to ensure it uses safe protocols
 * @param {string} url - URL to validate
 * @returns {string} Validated URL
 * @throws {Error} If URL is invalid or uses unsafe protocol
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL: must be a non-empty string');
  }

  try {
    const parsed = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Unsafe URL protocol: ${parsed.protocol}. Only http: and https: are allowed`);
    }

    return url;
  } catch (error) {
    // If URL parsing fails, it might be a relative URL or invalid format
    // Re-throw with more context
    if (error.message.includes('Unsafe URL protocol')) {
      throw error;
    }
    throw new Error(`Invalid URL format: ${error.message}`);
  }
}

/**
 * Validates that a value is a non-empty string
 * @param {any} value - Value to validate
 * @param {string} name - Name of the parameter (for error messages)
 * @returns {string} Validated string
 * @throws {Error} If value is not a non-empty string
 */
function validateString(value, name = 'value') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

module.exports = {
  validateSender,
  sanitizePath,
  validateUrl,
  validateString,
  getAllowedPaths,
};
