/* eslint-disable no-console */
/**
 * IPC handlers for chat sessions and messages (traceability)
 */
const crypto = require('crypto');

function generateId() {
  return crypto.randomUUID();
}

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:chat:createSession', (event, { id: providedId, agentId, resourceId, mode, contextId, threadId, title, toolIds, mcpServerIds }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const id = providedId || generateId();
      const now = Date.now();
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

  ipcMain.handle('db:chat:getSessionsByAgent', (event, { agentId, limit }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const sessions = queries.getChatSessionsByAgent.all(agentId, limit ?? 50);
      return { success: true, data: sessions };
    } catch (error) {
      console.error('[DB] Error getting chat sessions by agent:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:chat:getSessionsGlobal', (event, limit) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const sessions = queries.getChatSessionsGlobal.all(limit ?? 50);
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
}

module.exports = { register };
