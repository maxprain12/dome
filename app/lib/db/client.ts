/**
 * Database Client - Renderer Process
 * Communicates with the main process via IPC
 *
 * IMPORTANT: This file runs in the renderer process (Next.js)
 * All database operations are handled by the main process via IPC
 */

import { generateId } from '../utils';
import { capturePostHog } from '../analytics/posthog';
import { ANALYTICS_EVENTS } from '../analytics/events';
import type { DomeAgentFolder, DomeWorkflowFolder, ManyAgent, MCPServerConfig } from '@/types';
import type { CanvasWorkflow, WorkflowExecution } from '@/types/canvas';

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
  type: 'pdf' | 'video' | 'audio' | 'image' | 'url' | 'folder' | 'notebook';
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

export interface AISkillRecord {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled?: boolean;
}

export interface MarketplaceAgentInstallRecord {
  marketplaceId: string;
  localAgentId: string;
  version: string;
  author: string;
  source: 'official' | 'community';
  installedAt: number;
  updatedAt: number;
  capabilities: string[];
  resourceAffinity: string[];
}

export interface MarketplaceWorkflowInstallRecord {
  templateId: string;
  localWorkflowId: string;
  version: string;
  author: string;
  source: 'official' | 'community';
  installedAt: number;
  updatedAt: number;
  capabilities: string[];
  resourceAffinity: string[];
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

    const result = await this.db.projects.create(project);
    if (result.success) {
      capturePostHog(ANALYTICS_EVENTS.PROJECT_CREATED, {});
    }
    return result;
  }

  async getProjects(): Promise<DBResponse<Project[]>> {
    return this.db.projects.getAll();
  }

  async getProjectById(id: string): Promise<DBResponse<Project>> {
    return this.db.projects.getById(id);
  }

  async getProjectDeletionImpact(projectId: string): Promise<DBResponse<Record<string, number>>> {
    return this.db.projects.getDeletionImpact(projectId) as Promise<DBResponse<Record<string, number>>>;
  }

  async deleteProjectWithContent(projectId: string): Promise<DBResponse<void>> {
    return this.db.projects.deleteWithContent(projectId) as Promise<DBResponse<void>>;
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
  // CHAT (traceability)
  // ============================================

  async createChatSession(opts: {
    id?: string;
    agentId?: string | null;
    resourceId?: string | null;
    mode?: 'many' | 'agent' | 'team' | 'workflow' | 'canvas' | null;
    contextId?: string | null;
    threadId?: string | null;
    title?: string | null;
    toolIds?: string[];
    mcpServerIds?: string[];
    projectId?: string;
  }): Promise<DBResponse<{ id: string; agentId?: string | null; resourceId?: string | null; mode?: string | null; contextId?: string | null; threadId?: string | null; title?: string | null; toolIds?: string[]; mcpServerIds?: string[]; createdAt: number; updatedAt: number }>> {
    return this.db.chat.createSession(opts) as Promise<DBResponse<{ id: string; agentId?: string | null; resourceId?: string | null; mode?: string | null; contextId?: string | null; threadId?: string | null; title?: string | null; toolIds?: string[]; mcpServerIds?: string[]; createdAt: number; updatedAt: number }>>;
  }

  async getChatSession(sessionId: string): Promise<
    DBResponse<{
      id: string;
      agent_id: string | null;
      resource_id: string | null;
      mode: string | null;
      context_id: string | null;
      thread_id: string | null;
      title: string | null;
      tool_ids: string[];
      mcp_server_ids: string[];
      messages: Array<{
        id: string;
        session_id: string;
        role: 'user' | 'assistant';
        content: string;
        tool_calls: Array<{ id: string; name: string; arguments: Record<string, unknown>; status?: string; result?: unknown; error?: string }> | null;
        thinking: string | null;
        metadata: Record<string, unknown> | null;
        created_at: number;
      }>;
    } | null>
  > {
    return this.db.chat.getSession(sessionId) as Promise<
      DBResponse<{
        id: string;
        agent_id: string | null;
        resource_id: string | null;
        mode: string | null;
        context_id: string | null;
        thread_id: string | null;
        title: string | null;
        tool_ids: string[];
        mcp_server_ids: string[];
        messages: Array<{
          id: string;
          session_id: string;
          role: 'user' | 'assistant';
          content: string;
          tool_calls: Array<{ id: string; name: string; arguments: Record<string, unknown>; status?: string; result?: unknown; error?: string }> | null;
          thinking: string | null;
          metadata: Record<string, unknown> | null;
          created_at: number;
        }>;
      } | null>
    >;
  }

  async updateChatSession(opts: {
    id: string;
    mode?: 'many' | 'agent' | 'team' | 'workflow' | 'canvas' | null;
    contextId?: string | null;
    threadId?: string | null;
    title?: string | null;
    toolIds?: string[];
    mcpServerIds?: string[];
  }): Promise<DBResponse<void>> {
    return this.db.chat.updateSession(opts) as Promise<DBResponse<void>>;
  }

  async getChatSessionsByAgent(opts: {
    agentId: string;
    projectId?: string;
    limit?: number;
  }): Promise<DBResponse<Array<{ id: string; agent_id: string | null; resource_id: string | null; thread_id: string | null; created_at: number; updated_at: number }>>> {
    return this.db.chat.getSessionsByAgent({
      agentId: opts.agentId,
      projectId: opts.projectId ?? 'default',
      limit: opts.limit,
    }) as Promise<DBResponse<Array<{ id: string; agent_id: string | null; resource_id: string | null; thread_id: string | null; created_at: number; updated_at: number }>>>;
  }

  async getChatSessionsGlobal(
    limitOrOpts?: number | { limit?: number; projectId?: string },
  ): Promise<DBResponse<Array<{ id: string; agent_id: string | null; resource_id: string | null; thread_id: string | null; created_at: number; updated_at: number }>>> {
    const payload =
      limitOrOpts === undefined
        ? { limit: 50, projectId: 'default' }
        : typeof limitOrOpts === 'number'
          ? { limit: limitOrOpts, projectId: 'default' }
          : { limit: limitOrOpts.limit ?? 50, projectId: limitOrOpts.projectId ?? 'default' };
    return this.db.chat.getSessionsGlobal(payload) as Promise<
      DBResponse<Array<{ id: string; agent_id: string | null; resource_id: string | null; thread_id: string | null; created_at: number; updated_at: number }>>
    >;
  }

  async addChatMessage(opts: {
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown>; status?: string; result?: unknown; error?: string }>;
    thinking?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<DBResponse<{ id: string; sessionId: string; role: string; content: string; toolCalls?: unknown[]; thinking?: string | null; metadata?: Record<string, unknown>; createdAt: number }>> {
    return this.db.chat.addMessage(opts) as Promise<DBResponse<{ id: string; sessionId: string; role: string; content: string; toolCalls?: unknown[]; thinking?: string | null; metadata?: Record<string, unknown>; createdAt: number }>>;
  }

  async appendChatTrace(opts: {
    sessionId: string;
    messageId?: string | null;
    type: 'tool_call' | 'tool_result' | 'decision' | 'interrupt';
    toolName?: string | null;
    toolArgs?: Record<string, unknown>;
    result?: unknown;
    mcpServerId?: string | null;
    decision?: string | null;
  }): Promise<DBResponse<{ id: string }>> {
    return this.db.chat.appendTrace(opts) as Promise<DBResponse<{ id: string }>>;
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

  async getManyAgents(projectId = 'default'): Promise<DBResponse<ManyAgent[]>> {
    return window.electron.invoke('db:manyAgents:list', projectId) as Promise<DBResponse<ManyAgent[]>>;
  }

  async getManyAgent(id: string): Promise<DBResponse<ManyAgent | null>> {
    return window.electron.invoke('db:manyAgents:get', id) as Promise<DBResponse<ManyAgent | null>>;
  }

  async createManyAgent(agent: ManyAgent): Promise<DBResponse<ManyAgent>> {
    return window.electron.invoke('db:manyAgents:create', agent) as Promise<DBResponse<ManyAgent>>;
  }

  async updateManyAgent(id: string, updates: Partial<ManyAgent>): Promise<DBResponse<ManyAgent>> {
    return window.electron.invoke('db:manyAgents:update', id, updates) as Promise<DBResponse<ManyAgent>>;
  }

  async deleteManyAgent(id: string): Promise<DBResponse<void>> {
    return window.electron.invoke('db:manyAgents:delete', id) as Promise<DBResponse<void>>;
  }

  async listAgentFolders(projectId = 'default'): Promise<DBResponse<DomeAgentFolder[]>> {
    return window.electron.invoke('db:agentFolders:list', projectId) as Promise<DBResponse<DomeAgentFolder[]>>;
  }

  async createAgentFolder(folder: DomeAgentFolder): Promise<DBResponse<DomeAgentFolder>> {
    return window.electron.invoke('db:agentFolders:create', folder) as Promise<DBResponse<DomeAgentFolder>>;
  }

  async updateAgentFolder(
    id: string,
    updates: Partial<Pick<DomeAgentFolder, 'parentId' | 'name' | 'sortOrder'>>,
  ): Promise<DBResponse<DomeAgentFolder>> {
    return window.electron.invoke('db:agentFolders:update', id, updates) as Promise<
      DBResponse<DomeAgentFolder>
    >;
  }

  async deleteAgentFolder(id: string): Promise<DBResponse<void>> {
    return window.electron.invoke('db:agentFolders:delete', id) as Promise<DBResponse<void>>;
  }

  async getWorkflows(projectId = 'default'): Promise<DBResponse<CanvasWorkflow[]>> {
    return window.electron.invoke('db:workflows:list', projectId) as Promise<DBResponse<CanvasWorkflow[]>>;
  }

  async getWorkflow(id: string): Promise<DBResponse<CanvasWorkflow | null>> {
    return window.electron.invoke('db:workflows:get', id) as Promise<DBResponse<CanvasWorkflow | null>>;
  }

  async createWorkflow(workflow: CanvasWorkflow): Promise<DBResponse<CanvasWorkflow>> {
    return window.electron.invoke('db:workflows:create', workflow) as Promise<DBResponse<CanvasWorkflow>>;
  }

  async updateWorkflow(id: string, updates: Partial<CanvasWorkflow>): Promise<DBResponse<CanvasWorkflow>> {
    return window.electron.invoke('db:workflows:update', id, updates) as Promise<DBResponse<CanvasWorkflow>>;
  }

  async deleteWorkflow(id: string): Promise<DBResponse<void>> {
    return window.electron.invoke('db:workflows:delete', id) as Promise<DBResponse<void>>;
  }

  async listWorkflowFolders(projectId = 'default'): Promise<DBResponse<DomeWorkflowFolder[]>> {
    return window.electron.invoke('db:workflowFolders:list', projectId) as Promise<DBResponse<DomeWorkflowFolder[]>>;
  }

  async createWorkflowFolder(folder: DomeWorkflowFolder): Promise<DBResponse<DomeWorkflowFolder>> {
    return window.electron.invoke('db:workflowFolders:create', folder) as Promise<
      DBResponse<DomeWorkflowFolder>
    >;
  }

  async updateWorkflowFolder(
    id: string,
    updates: Partial<Pick<DomeWorkflowFolder, 'parentId' | 'name' | 'sortOrder'>>,
  ): Promise<DBResponse<DomeWorkflowFolder>> {
    return window.electron.invoke('db:workflowFolders:update', id, updates) as Promise<
      DBResponse<DomeWorkflowFolder>
    >;
  }

  async deleteWorkflowFolder(id: string): Promise<DBResponse<void>> {
    return window.electron.invoke('db:workflowFolders:delete', id) as Promise<DBResponse<void>>;
  }

  async saveWorkflowExecution(execution: WorkflowExecution): Promise<DBResponse<void>> {
    return window.electron.invoke('db:workflowExecutions:save', execution) as Promise<DBResponse<void>>;
  }

  async getWorkflowExecutionsByWorkflow(workflowId: string): Promise<DBResponse<WorkflowExecution[]>> {
    return window.electron.invoke('db:workflowExecutions:listByWorkflow', workflowId) as Promise<DBResponse<WorkflowExecution[]>>;
  }

  async getWorkflowExecution(id: string): Promise<DBResponse<WorkflowExecution | null>> {
    return window.electron.invoke('db:workflowExecutions:get', id) as Promise<DBResponse<WorkflowExecution | null>>;
  }

  async getMcpServers(): Promise<DBResponse<MCPServerConfig[]>> {
    return window.electron.invoke('db:mcp:list') as Promise<DBResponse<MCPServerConfig[]>>;
  }

  async replaceMcpServers(servers: MCPServerConfig[]): Promise<DBResponse<void>> {
    return window.electron.invoke('db:mcp:replaceAll', servers) as Promise<DBResponse<void>>;
  }

  async getMcpGlobalEnabled(): Promise<DBResponse<boolean>> {
    return window.electron.invoke('db:mcp:getGlobalEnabled') as Promise<DBResponse<boolean>>;
  }

  async setMcpGlobalEnabled(enabled: boolean): Promise<DBResponse<void>> {
    return window.electron.invoke('db:mcp:setGlobalEnabled', enabled) as Promise<DBResponse<void>>;
  }

  async getAISkills(): Promise<DBResponse<AISkillRecord[]>> {
    return window.electron.invoke('db:skills:list') as Promise<DBResponse<AISkillRecord[]>>;
  }

  async replaceAISkills(skills: AISkillRecord[]): Promise<DBResponse<void>> {
    return window.electron.invoke('db:skills:replaceAll', skills) as Promise<DBResponse<void>>;
  }

  async getMarketplaceAgentInstalls(): Promise<DBResponse<Record<string, MarketplaceAgentInstallRecord>>> {
    return window.electron.invoke('db:marketplace:getAgentInstalls') as Promise<DBResponse<Record<string, MarketplaceAgentInstallRecord>>>;
  }

  async replaceMarketplaceAgentInstalls(records: Record<string, MarketplaceAgentInstallRecord>): Promise<DBResponse<void>> {
    return window.electron.invoke('db:marketplace:replaceAgentInstalls', records) as Promise<DBResponse<void>>;
  }

  async getMarketplaceWorkflowInstalls(): Promise<DBResponse<Record<string, MarketplaceWorkflowInstallRecord>>> {
    return window.electron.invoke('db:marketplace:getWorkflowInstalls') as Promise<DBResponse<Record<string, MarketplaceWorkflowInstallRecord>>>;
  }

  async replaceMarketplaceWorkflowInstalls(records: Record<string, MarketplaceWorkflowInstallRecord>): Promise<DBResponse<void>> {
    return window.electron.invoke('db:marketplace:replaceWorkflowInstalls', records) as Promise<DBResponse<void>>;
  }

  async getMarketplaceTemplateMappings(): Promise<DBResponse<Record<string, string>>> {
    return window.electron.invoke('db:marketplace:getTemplateMappings') as Promise<DBResponse<Record<string, string>>>;
  }

  async replaceMarketplaceTemplateMappings(mapping: Record<string, string>): Promise<DBResponse<void>> {
    return window.electron.invoke('db:marketplace:replaceTemplateMappings', mapping) as Promise<DBResponse<void>>;
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
