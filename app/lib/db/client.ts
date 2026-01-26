/**
 * Database Client - Renderer Process
 * Communicates with the main process via IPC
 *
 * IMPORTANT: This file runs in the renderer process (Next.js)
 * All database operations are handled by the main process via IPC
 */

import { generateId } from '../utils';

// Type definitions
export interface Project {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  created_at: number;
  updated_at: number;
}

export interface Resource {
  id: string;
  project_id: string;
  type: 'note' | 'pdf' | 'video' | 'audio' | 'image' | 'url' | 'document' | 'folder';
  title: string;
  content?: string;
  // Legacy external file path (deprecated)
  file_path?: string;
  // Internal file storage (new system)
  internal_path?: string;
  file_mime_type?: string;
  file_size?: number;
  file_hash?: string;
  thumbnail_data?: string;
  original_filename?: string;
  // Folder containment
  folder_id?: string | null;
  metadata?: Record<string, any>;
  created_at: number;
  updated_at: number;
}

export interface ResourceImportResult {
  success: boolean;
  data?: Resource;
  thumbnailDataUrl?: string;
  error?: string;
  duplicate?: {
    id: string;
    title: string;
    projectId: string;
  };
}

export interface StorageUsage {
  total: number;
  byType: Record<string, number>;
  fileCount: number;
}

export interface DBResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Database client singleton
 */
class DatabaseClient {
  private get db() {
    if (typeof window === 'undefined') {
      throw new Error('Database API not available. Window is undefined (SSR).');
    }
    if (!window.electron?.db) {
      throw new Error('Database API not available. Make sure you are running in Electron and the preload script has loaded.');
    }
    return window.electron.db;
  }

  /**
   * Check if database API is available
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electron?.db;
  }

  // ============================================
  // PROJECTS
  // ============================================

  async createProject(data: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<DBResponse<Project>> {
    const now = Date.now();
    const project: Project = {
      id: generateId(),
      ...data,
      created_at: now,
      updated_at: now,
    };

    return this.db.projects.create(project);
  }

  async getProjects(): Promise<DBResponse<Project[]>> {
    return this.db.projects.getAll();
  }

  async getProjectById(id: string): Promise<DBResponse<Project>> {
    return this.db.projects.getById(id);
  }

  // ============================================
  // RESOURCES
  // ============================================

  async createResource(data: Omit<Resource, 'id' | 'created_at' | 'updated_at'>): Promise<DBResponse<Resource>> {
    const now = Date.now();
    const resource: Resource = {
      id: generateId(),
      ...data,
      created_at: now,
      updated_at: now,
    };

    return this.db.resources.create(resource);
  }

  async getResourcesByProject(projectId: string): Promise<DBResponse<Resource[]>> {
    return this.db.resources.getByProject(projectId);
  }

  async getResourceById(id: string): Promise<DBResponse<Resource>> {
    return this.db.resources.getById(id);
  }

  async updateResource(id: string, data: Partial<Resource>): Promise<DBResponse<Resource>> {
    const resource = {
      ...data,
      id,
      updated_at: Date.now(),
    };

    return this.db.resources.update(resource);
  }

  async searchResources(query: string): Promise<DBResponse<Resource[]>> {
    return this.db.resources.search(query);
  }

  // ============================================
  // SETTINGS
  // ============================================

  async getSetting(key: string): Promise<DBResponse<string>> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Database API not available' };
    }
    return this.db.settings.get(key);
  }

  async setSetting(key: string, value: string): Promise<DBResponse<void>> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Database API not available' };
    }
    return this.db.settings.set(key, value);
  }

  // ============================================
  // RESOURCE FILE STORAGE
  // ============================================

  private get resourceApi() {
    if (typeof window === 'undefined') {
      throw new Error('Resource API not available. Window is undefined (SSR).');
    }
    if (!window.electron?.resource) {
      throw new Error('Resource API not available. Make sure you are running in Electron.');
    }
    return window.electron.resource;
  }

  /**
   * Import a file to internal storage and create a resource
   */
  async importFile(
    filePath: string,
    projectId: string,
    type: Resource['type'],
    title?: string
  ): Promise<ResourceImportResult> {
    return this.resourceApi.import(filePath, projectId, type, title);
  }

  /**
   * Import multiple files at once
   */
  async importMultipleFiles(
    filePaths: string[],
    projectId: string,
    type?: Resource['type']
  ): Promise<{
    success: boolean;
    data: Array<{ success: boolean; data: Resource }>;
    errors?: Array<{ filePath: string; error: string }>;
  }> {
    return this.resourceApi.importMultiple(filePaths, projectId, type);
  }

  /**
   * Get the full file path for a resource (to open in native app)
   */
  async getResourceFilePath(resourceId: string): Promise<DBResponse<string>> {
    return this.resourceApi.getFilePath(resourceId);
  }

  /**
   * Read resource file content as Base64 data URL
   */
  async readResourceFile(resourceId: string): Promise<DBResponse<string>> {
    return this.resourceApi.readFile(resourceId);
  }

  /**
   * Export resource to a user-selected location
   */
  async exportResource(resourceId: string, destinationPath: string): Promise<DBResponse<string>> {
    return this.resourceApi.export(resourceId, destinationPath);
  }

  /**
   * Delete resource and its internal file
   */
  async deleteResource(resourceId: string): Promise<DBResponse<void>> {
    return this.resourceApi.delete(resourceId);
  }

  /**
   * Regenerate thumbnail for a resource
   */
  async regenerateThumbnail(resourceId: string): Promise<DBResponse<string>> {
    return this.resourceApi.regenerateThumbnail(resourceId);
  }

  // ============================================
  // STORAGE MANAGEMENT
  // ============================================

  private get storageApi() {
    if (typeof window === 'undefined') {
      throw new Error('Storage API not available. Window is undefined (SSR).');
    }
    if (!window.electron?.storage) {
      throw new Error('Storage API not available. Make sure you are running in Electron.');
    }
    return window.electron.storage;
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage(): Promise<DBResponse<StorageUsage>> {
    return this.storageApi.getUsage();
  }

  /**
   * Clean up orphaned files
   */
  async cleanupStorage(): Promise<DBResponse<{ deleted: number; freedBytes: number }>> {
    return this.storageApi.cleanup();
  }

  /**
   * Get storage directory path
   */
  async getStoragePath(): Promise<DBResponse<string>> {
    return this.storageApi.getPath();
  }

  // ============================================
  // MIGRATION
  // ============================================

  private get migrationApi() {
    if (typeof window === 'undefined') {
      throw new Error('Migration API not available. Window is undefined (SSR).');
    }
    if (!window.electron?.migration) {
      throw new Error('Migration API not available. Make sure you are running in Electron.');
    }
    return window.electron.migration;
  }

  /**
   * Migrate legacy resources to internal storage
   */
  async migrateResources(): Promise<DBResponse<{
    migrated: number;
    failed: number;
    errors?: Array<{ id: string; error: string }>;
  }>> {
    return this.migrationApi.migrateResources();
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<DBResponse<{
    pendingMigrations: number;
    resources: Array<{ id: string; title: string; file_path: string }>;
  }>> {
    return this.migrationApi.getStatus();
  }
}

// Export singleton instance
export const db = new DatabaseClient();

// Export default
export default db;
