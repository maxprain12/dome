/**
 * Validation utilities for Dome
 */

/**
 * Validate email address format
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate user name
 */
export function validateName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  const trimmedName = name.trim();
  return trimmedName.length >= 2 && trimmedName.length <= 100;
}

/**
 * Get user initials from full name
 * @example getInitials("Max Prain") => "MP"
 * @example getInitials("John") => "J"
 */
export function getInitials(name: string): string {
  if (!name || typeof name !== 'string') {
    return '?';
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return '?';
  }

  const parts = trimmedName.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0]!.charAt(0).toUpperCase();
  }

  // Take first letter of first name and first letter of last name
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Validate image file extension
 */
export function isValidImageFile(filename: string): boolean {
  if (!filename || typeof filename !== 'string') {
    return false;
  }

  const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const lowerFilename = filename.toLowerCase();

  return validExtensions.some(ext => lowerFilename.endsWith(ext));
}

/**
 * Sanitize filename (remove special characters)
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'file';
  }

  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}
