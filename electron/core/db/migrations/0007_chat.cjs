/**
 * 0007_chat — chat_sessions, chat_messages, chat_traces
 */
module.exports = {
  id: '0007_chat',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        resource_id TEXT,
        mode TEXT,
        context_id TEXT,
        thread_id TEXT,
        title TEXT,
        tool_ids TEXT,
        mcp_server_ids TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default'
      );

      CREATE INDEX idx_chat_sessions_agent ON chat_sessions(agent_id);
      CREATE INDEX idx_chat_sessions_context ON chat_sessions(context_id);
      CREATE INDEX idx_chat_sessions_mode ON chat_sessions(mode);
      CREATE INDEX idx_chat_sessions_project ON chat_sessions(project_id);
      CREATE INDEX idx_chat_sessions_resource ON chat_sessions(resource_id);
      CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at);

      CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        tool_calls TEXT,
        thinking TEXT,
        metadata TEXT,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
      CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);

      CREATE TABLE chat_traces (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        message_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('tool_call', 'tool_result', 'decision', 'interrupt')),
        tool_name TEXT,
        tool_args TEXT,
        result TEXT,
        mcp_server_id TEXT,
        decision TEXT,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX idx_chat_traces_message ON chat_traces(message_id);
      CREATE INDEX idx_chat_traces_session ON chat_traces(session_id);
    `);
  },
};
