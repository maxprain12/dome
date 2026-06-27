import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const agentFolders = sqliteTable('agent_folders', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const workflowFolders = sqliteTable('workflow_folders', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const manyAgents = sqliteTable('many_agents', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  name: text('name').notNull(),
  description: text('description'),
  systemInstructions: text('system_instructions'),
  toolIds: text('tool_ids').notNull().default('[]'),
  mcpServerIds: text('mcp_server_ids').notNull().default('[]'),
  skillIds: text('skill_ids').notNull().default('[]'),
  iconIndex: integer('icon_index').notNull().default(1),
  marketplaceId: text('marketplace_id'),
  folderId: text('folder_id'),
  favorite: integer('favorite').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const canvasWorkflows = sqliteTable('canvas_workflows', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  name: text('name').notNull(),
  description: text('description'),
  nodesJson: text('nodes_json').notNull().default('[]'),
  edgesJson: text('edges_json').notNull().default('[]'),
  marketplaceJson: text('marketplace_json'),
  folderId: text('folder_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const workflowExecutions = sqliteTable('workflow_executions', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  projectId: text('project_id').notNull().default('default'),
  workflowName: text('workflow_name').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  status: text('status').notNull(),
  entriesJson: text('entries_json').notNull().default('[]'),
  nodeOutputsJson: text('node_outputs_json'),
  updatedAt: integer('updated_at').notNull(),
});

export const manyAgentVersions = sqliteTable('many_agent_versions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const agentStore = sqliteTable('agent_store', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  key: text('key').notNull(),
  valueJson: text('value_json'),
  updatedAt: integer('updated_at').notNull(),
});

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type').notNull(),
  command: text('command'),
  argsJson: text('args_json'),
  url: text('url'),
  headersJson: text('headers_json'),
  envJson: text('env_json'),
  enabled: integer('enabled').notNull().default(1),
  toolsJson: text('tools_json'),
  enabledToolIdsJson: text('enabled_tool_ids_json'),
  lastDiscoveryAt: integer('last_discovery_at'),
  lastDiscoveryError: text('last_discovery_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const mcpGlobalSettings = sqliteTable('mcp_global_settings', {
  id: integer('id').primaryKey(),
  enabled: integer('enabled').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});

export const aiSkills = sqliteTable('ai_skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  prompt: text('prompt').notNull(),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const marketplaceAgentInstalls = sqliteTable('marketplace_agent_installs', {
  marketplaceId: text('marketplace_id').primaryKey(),
  localAgentId: text('local_agent_id').notNull(),
  version: text('version'),
  author: text('author'),
  source: text('source'),
  installedAt: integer('installed_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  capabilitiesJson: text('capabilities_json').notNull().default('[]'),
  resourceAffinityJson: text('resource_affinity_json').notNull().default('[]'),
});

export const marketplaceWorkflowInstalls = sqliteTable('marketplace_workflow_installs', {
  templateId: text('template_id').primaryKey(),
  localWorkflowId: text('local_workflow_id').notNull(),
  version: text('version'),
  author: text('author'),
  source: text('source'),
  installedAt: integer('installed_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  capabilitiesJson: text('capabilities_json').notNull().default('[]'),
  resourceAffinityJson: text('resource_affinity_json').notNull().default('[]'),
});

export const marketplaceTemplateMappings = sqliteTable('marketplace_template_mappings', {
  templateId: text('template_id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const domeProviderSessions = sqliteTable('dome_provider_sessions', {
  userId: text('user_id').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const authProfiles = sqliteTable('auth_profiles', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  label: text('label'),
  credentialsJson: text('credentials_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const graphNodes = sqliteTable('graph_nodes', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull(),
  label: text('label'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const graphEdges = sqliteTable('graph_edges', {
  id: text('id').primaryKey(),
  sourceNodeId: text('source_node_id').notNull(),
  targetNodeId: text('target_node_id').notNull(),
  relationType: text('relation_type').notNull(),
  weight: integer('weight'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
});
