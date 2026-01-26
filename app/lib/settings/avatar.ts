/**
 * Avatar management utilities for Dome
 *
 * Note: Avatar file operations are handled via Electron IPC
 * This module provides helper functions for the renderer process
 */

import { getUserDataPath } from '../utils/paths';
import path from 'path';

/**
 * Get the absolute URL for an avatar file
 * @param relativePath - Relative path stored in DB (e.g., "avatars/user-avatar-123.jpg")
 * @returns Absolute file:// URL
 */
export function getAvatarURL(relativePath: string): string {
  const userDataPath = getUserDataPath();
  const absolutePath = path.join(userDataPath, relativePath);
  return `file://${absolutePath}`;
}

/**
 * Generate a unique avatar filename
 * @param originalFilename - Original filename with extension
 * @returns Relative path for storage (e.g., "avatars/user-avatar-1705512345678.jpg")
 */
export function generateAvatarFilename(originalFilename: string): string {
  const ext = path.extname(originalFilename);
  const timestamp = Date.now();
  return `avatars/user-avatar-${timestamp}${ext}`;
}

/**
 * Select and copy avatar from file system
 * This function is meant to be called from renderer process
 * It handles the full flow: select → copy → return relative path
 *
 * @returns Promise<string | null> - Relative path to avatar or null if cancelled
 */
export async function selectAndCopyAvatar(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.electron) {
    console.error('Electron API not available');
    return null;
  }

  try {
    // Open file dialog
    const selectedPath = await window.electron.selectAvatar();

    if (!selectedPath) {
      // User cancelled
      return null;
    }

    // Copy file to userData/avatars/ via IPC
    const result = await window.electron.avatar.copyFile(selectedPath);

    if (!result.success) {
      console.error('Error copying avatar:', result.error);
      return null;
    }

    // Return relative path (e.g., "avatars/user-avatar-1234567890.jpg")
    return result.data;

  } catch (error) {
    console.error('Error selecting avatar:', error);
    return null;
  }
}

/**
 * Delete an avatar file
 * @param relativePath - Relative path to the avatar file
 * 
 * Note: This function currently does not delete the file directly.
 * Avatar files are managed by the main process and should be deleted
 * through the avatar management system or when the user changes their avatar.
 * If direct deletion is needed, an IPC handler should be created.
 */
export async function deleteAvatar(relativePath: string): Promise<boolean> {
  // TODO: Create IPC handler for safe file deletion if needed
  // For now, avatar files are cleaned up automatically when replaced
  console.warn('[deleteAvatar] Direct file deletion not implemented. Files are managed by main process.');
  return false;
}

/**
 * Check if a file is a valid image
 * @param filename - Filename to check
 */
export function isValidImageFile(filename: string): boolean {
  const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(filename).toLowerCase();
  return validExtensions.includes(ext);
}
