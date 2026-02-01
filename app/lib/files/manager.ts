/**
 * File System Manager - Renderer Process
 *
 * NOTE: This file runs in the renderer process (browser context).
 * Node.js APIs like 'fs' and 'crypto' are NOT available directly.
 * All file operations are performed via IPC to the main process.
 *
 * All file operations use IPC handlers defined in electron/main.cjs
 */

import path from 'path';
import { getUserDataPath } from '../utils/paths';

// Note: FILES_DIR calculation may not work in renderer without Electron
// In Electron, this should use app.getPath('userData') from main process
let FILES_DIR: string;

function getFilesDir(): string {
  if (typeof window !== 'undefined' && window.electron) {
    // In Electron, we should get this from main process via IPC
    // For now, use the same calculation
    const userDataPath = getUserDataPath();
    return path.join(userDataPath, 'dome-files');
  }
  // Fallback for non-Electron environments
  const userDataPath = getUserDataPath();
  return path.join(userDataPath, 'dome-files');
}

FILES_DIR = getFilesDir();

// Tipos de archivo soportados
export const SUPPORTED_FILE_TYPES = {
  pdf: ['.pdf'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  video: ['.mp4', '.webm', '.ogg', '.mov'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac'],
  document: ['.docx', '.doc', '.txt', '.md', '.rtf', '.odt'],
};

// Inicializar el sistema de archivos
// NOTE: This function is now handled in electron/init.cjs via IPC
// This stub is kept for compatibility but does nothing in renderer
export async function initFileSystem() {
  console.warn('⚠️ initFileSystem called in renderer - initialization happens in main process');
  // File system initialization happens in electron/init.cjs
  // This function is kept for compatibility but should not be called from renderer
  return Promise.resolve();
}

// Obtener el tipo de archivo por extensión
export function getFileType(filename: string): keyof typeof SUPPORTED_FILE_TYPES | 'unknown' {
  const ext = path.extname(filename).toLowerCase();

  for (const [type, extensions] of Object.entries(SUPPORTED_FILE_TYPES)) {
    if (extensions.includes(ext)) {
      return type as keyof typeof SUPPORTED_FILE_TYPES;
    }
  }

  return 'unknown';
}

// Generar un hash único para el archivo
export async function generateFileHash(filePath: string): Promise<string> {
  const result = await (window as any).electron.file.generateHash(filePath);
  if (!result.success) throw new Error(result.error || 'Failed to generate hash');
  return result.data;
}

// Guardar archivo en el sistema
// NOTE: Use window.electron.resource.import() instead - it handles file saving internally
export async function saveFile(
  sourceFilePath: string,
  resourceId: string
): Promise<{ path: string; hash: string; size: number }> {
  const fileType = getFileType(sourceFilePath);

  if (fileType === 'unknown') {
    throw new Error('Tipo de archivo no soportado');
  }

  // This functionality is handled by resource:import IPC handler
  // Use window.electron.resource.import() for saving files
  throw new Error('Use window.electron.resource.import() for saving files');
}

// Leer archivo
export async function readFile(filePath: string): Promise<Buffer> {
  const result = await (window as any).electron.file.readFile(filePath);
  if (!result.success) throw new Error(result.error || 'Failed to read file');
  return Buffer.from(result.data);
}

// Eliminar archivo
export async function deleteFile(filePath: string): Promise<void> {
  const result = await (window as any).electron.file.deleteFile(filePath);
  if (!result.success) throw new Error(result.error || 'Failed to delete file');
}

// Obtener información del archivo
export async function getFileInfo(filePath: string) {
  const result = await (window as any).electron.file.getInfo(filePath);
  if (!result.success) throw new Error(result.error || 'Failed to get file info');
  return result.data;
}

// Extraer texto de PDF
export async function extractTextFromPDF(filePath: string): Promise<string> {
  const result = await (window as any).electron.file.extractPDFText(filePath);
  if (!result.success) throw new Error(result.error || 'Failed to extract PDF text');
  return result.data;
}

// Convertir imagen a base64 para preview
export async function imageToBase64(filePath: string): Promise<string> {
  const result = await (window as any).electron.file.imageToBase64(filePath);
  if (!result.success) throw new Error(result.error || 'Failed to convert image');
  return result.data;
}

// Obtener MIME type por extensión
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

// Limpiar archivos temporales
export async function cleanTempFiles(): Promise<void> {
  const result = await (window as any).electron.file.cleanTemp();
  if (!result.success) throw new Error(result.error || 'Failed to clean temp files');
}

// Obtener espacio usado
export async function getStorageUsage(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  const result = await (window as any).electron.storage.getUsage();
  if (!result.success) {
    return { total: 0, byType: {} };
  }
  return result.data;
}

export { FILES_DIR };

