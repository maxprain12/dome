/* eslint-disable no-console */
/**
 * IPC handlers for chat sessions and messages (traceability)
 */
const crypto = require('crypto');

function generateId() {
  return crypto.randomUUID();
}

function resolveChatProjectId(queries, { projectId, resourceId, agentId }) {
  if (projectId && String(projectId).trim()) {
    return String(projectId).trim();
  }
  if (resourceId) {
    const resource = queries.getResourceById.get(resourceId);
    if (resource?.project_id) return resource.project_id;
  }
  if (agentId) {
    const agent = queries.getManyAgentById.get(agentId);
    if (agent?.project_id) return agent.project_id;
  }
  return 'default';
}

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:chat:createSession', (event, { id: providedId, agentId, resourceId, mode, contextId, threadId, title, toolIds, mcpServerIds, projectId }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const id = providedId || generateId();
      const now = Date.now();
      const resolvedProjectId = resolveChatProjectId(queries, { projectId, resourceId, agentId });
      const existing = queries.getChatSession.get(id);
      if (existing) {
        queries.updateChatSession.run(
          mode ?? existing.mode ?? null,
          contextId ?? existing.context_id ?? null,
          threadId ?? existing.thread_id,
          title ?? existing.title ?? null,
          toolIds ? JSON.stringify(toolIds) : existing.tool_ids,
          mcpServerIds ? JSON.stringify(mcpServerIds) : existing.mcp_server_ids,
          now,
          id
        );
        return {
          success: true,
          data: {
            id,
            agentId,
            resourceId,
            projectId: existing.project_id ?? resolvedProjectId,
            mode: mode ?? existing.mode ?? null,
            contextId: contextId ?? existing.context_id ?? null,
            threadId,
            title: title ?? existing.title ?? null,
            toolIds,
            mcpServerIds,
            createdAt: existing.created_at,
            updatedAt: now,
          },
        };
      }
      queries.createChatSession.run(
        id,
        resolvedProjectId,
        agentId ?? null,
        resourceId ?? null,
        mode ?? null,
        contextId ?? null,
        threadId ?? null,
        title ?? null,
        toolIds ? JSON.stringify(toolIds) : null,
        mcpServerIds ? JSON.stringify(mcpServerIds) : null,
        now,
        now
      );
      return {
        success: true,
        data: {
          id,
          agentId,
          resourceId,
          projectId: resolvedProjectId,
          mode: mode ?? null,
          contextId: contextId ?? null,
          threadId,
          title: title ?? null,
          toolIds,
          mcpServerIds,
          createdAt: now,
          updatedAt: now,
        },
      };
    } catch (error) {
      console.error('[DB] Error creating chat session:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:getSession', (event, sessionId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const session = queries.getChatSession.get(sessionId);
      if (!session) return { success: true, data: null };
      const messages = queries.getChatMessagesBySession.all(sessionId);
      const parsed = {
        ...session,
        tool_ids: session.tool_ids ? JSON.parse(session.tool_ids) : [],
        mcp_server_ids: session.mcp_server_ids ? JSON.parse(session.mcp_server_ids) : [],
        messages: messages.map((m) => ({
          ...m,
          tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : null,
          metadata: m.metadata ? JSON.parse(m.metadata) : null,
        })),
      };
      return { success: true, data: parsed };
    } catch (error) {
      console.error('[DB] Error getting chat session:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:updateSession', (event, { id, mode, contextId, threadId, title, toolIds, mcpServerIds }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      queries.updateChatSession.run(
        mode ?? null,
        contextId ?? null,
        threadId ?? null,
        title ?? null,
        toolIds ? JSON.stringify(toolIds) : null,
        mcpServerIds ? JSON.stringify(mcpServerIds) : null,
        now,
        id
      );
      return { success: true };
    } catch (error) {
      console.error('[DB] Error updating chat session:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:getSessionsByAgent', (event, { agentId, projectId, limit }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      const sessions = queries.getChatSessionsByAgent.all(agentId, pid, limit ?? 50);
      return { success: true, data: sessions };
    } catch (error) {
      console.error('[DB] Error getting chat sessions by agent:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:getSessionsGlobal', (event, arg) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      let limit = 50;
      let projectId = 'default';
      if (typeof arg === 'number') {
        limit = arg;
      } else if (arg && typeof arg === 'object') {
        limit = arg.limit ?? 50;
        projectId = arg.projectId && String(arg.projectId).trim() ? String(arg.projectId).trim() : 'default';
      }
      const sessions = queries.getChatSessionsGlobal.all(projectId, limit);
      return { success: true, data: sessions };
    } catch (error) {
      console.error('[DB] Error getting global chat sessions:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:addMessage', (event, { sessionId, role, content, toolCalls, thinking, metadata }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const id = generateId();
      const now = Date.now();
      queries.createChatMessage.run(
        id,
        sessionId,
        role,
        content ?? '',
        toolCalls ? JSON.stringify(toolCalls) : null,
        thinking ?? null,
        metadata ? JSON.stringify(metadata) : null,
        now
      );
      return { success: true, data: { id, sessionId, role, content, toolCalls, thinking, metadata, createdAt: now } };
    } catch (error) {
      console.error('[DB] Error adding chat message:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:appendTrace', (event, { sessionId, messageId, type, toolName, toolArgs, result, mcpServerId, decision }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const id = generateId();
      const now = Date.now();
      queries.appendChatTrace.run(
        id,
        sessionId,
        messageId ?? null,
        type,
        toolName ?? null,
        toolArgs ? JSON.stringify(toolArgs) : null,
        result ? JSON.stringify(result) : null,
        mcpServerId ?? null,
        decision ?? null,
        now
      );
      return { success: true, data: { id } };
    } catch (error) {
      console.error('[DB] Error appending chat trace:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:clearSession', (event, sessionId) => {
    try {
      validateSender(event, windowManager);
      if (!sessionId || typeof sessionId !== 'string') {
        return { success: false, error: 'Invalid sessionId' };
      }
      const queries = database.getQueries();
      const existing = queries.getChatSession.get(sessionId);
      if (!existing) {
        return { success: true };
      }
      queries.deleteChatTracesBySession.run(sessionId);
      queries.deleteChatMessagesBySession.run(sessionId);
      const now = Date.now();
      queries.updateChatSession.run(
        existing.mode ?? null,
        existing.context_id ?? null,
        existing.thread_id ?? null,
        'New chat',
        existing.tool_ids ?? null,
        existing.mcp_server_ids ?? null,
        now,
        sessionId
      );
      return { success: true };
    } catch (error) {
      console.error('[DB] Error clearing chat session:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:deleteSession', (event, sessionId) => {
    try {
      validateSender(event, windowManager);
      if (!sessionId || typeof sessionId !== 'string') {
        return { success: false, error: 'Invalid sessionId' };
      }
      const queries = database.getQueries();
      queries.deleteChatSession.run(sessionId);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting chat session:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
