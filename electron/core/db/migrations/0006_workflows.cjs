/**
 * 0006_workflows — canvas_workflows, workflow_executions, workflow_folders,
 * automation_definitions, automation_runs, automation_run_steps,
 * automation_run_links, automation_artifact_bindings
 */
module.exports = {
  id: '0006_workflows',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE workflow_folders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        parent_id TEXT,
        name TEXT NOT NULL,
        sort_order BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_workflow_folders_parent ON workflow_folders(parent_id);
      CREATE INDEX idx_workflow_folders_project_id ON workflow_folders(project_id);

      CREATE TABLE canvas_workflows (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT,
        nodes_json TEXT NOT NULL DEFAULT '[]',
        edges_json TEXT NOT NULL DEFAULT '[]',
        marketplace_json TEXT,
        folder_id TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_canvas_workflows_folder_id ON canvas_workflows(folder_id);
      CREATE INDEX idx_canvas_workflows_project_id ON canvas_workflows(project_id);
      CREATE INDEX idx_canvas_workflows_updated_at ON canvas_workflows(updated_at);

      CREATE TABLE workflow_executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        workflow_name TEXT NOT NULL,
        started_at BIGINT NOT NULL,
        finished_at BIGINT,
        status TEXT NOT NULL,
        entries_json TEXT NOT NULL DEFAULT '[]',
        node_outputs_json TEXT,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_workflow_executions_project_id ON workflow_executions(project_id);
      CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);
      CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);

      CREATE TABLE automation_definitions (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        target_type TEXT NOT NULL CHECK(target_type IN ('many', 'agent', 'workflow', 'feeder')),
        target_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual', 'schedule', 'contextual')),
        schedule_json TEXT,
        input_template_json TEXT,
        output_mode TEXT NOT NULL DEFAULT 'chat_only',
        enabled BIGINT NOT NULL DEFAULT 0,
        legacy_source TEXT,
        last_run_at BIGINT,
        last_run_status TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_automation_definitions_project ON automation_definitions(project_id);
      CREATE INDEX idx_automation_definitions_target ON automation_definitions(target_type, target_id);
      CREATE INDEX idx_automation_definitions_trigger ON automation_definitions(trigger_type, enabled);

      CREATE TABLE automation_runs (
        id TEXT PRIMARY KEY,
        automation_id TEXT,
        owner_type TEXT NOT NULL CHECK(owner_type IN ('many', 'agent', 'workflow', 'automation')),
        owner_id TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
        session_id TEXT,
        workflow_id TEXT,
        workflow_execution_id TEXT,
        thread_id TEXT,
        output_text TEXT,
        summary TEXT,
        error TEXT,
        metadata TEXT,
        started_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        finished_at BIGINT,
        last_heartbeat_at BIGINT,
        project_id TEXT NOT NULL DEFAULT 'default'
      );

      CREATE INDEX idx_automation_runs_automation ON automation_runs(automation_id, updated_at);
      CREATE INDEX idx_automation_runs_owner ON automation_runs(owner_type, owner_id, updated_at);
      CREATE INDEX idx_automation_runs_project ON automation_runs(project_id);
      CREATE INDEX idx_automation_runs_session ON automation_runs(session_id, updated_at);
      CREATE INDEX idx_automation_runs_status ON automation_runs(status, updated_at);

      CREATE TABLE automation_run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        parent_step_id TEXT,
        step_type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'done',
        content TEXT,
        metadata TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_automation_run_steps_run ON automation_run_steps(run_id, created_at);

      CREATE TABLE automation_run_links (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        link_type TEXT NOT NULL,
        link_id TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX idx_automation_run_links_run ON automation_run_links(run_id);

      CREATE TABLE automation_artifact_bindings (
        id TEXT PRIMARY KEY,
        automation_id TEXT NOT NULL,
        artifact_resource_id TEXT NOT NULL,
        slot TEXT NOT NULL DEFAULT 'default',
        update_policy TEXT NOT NULL DEFAULT 'replace',
        transform_hint TEXT,
        extract_mode TEXT NOT NULL DEFAULT 'json_fence',
        enabled BIGINT NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_auto_art_bindings_auto ON automation_artifact_bindings(automation_id);
      CREATE INDEX idx_auto_art_bindings_res ON automation_artifact_bindings(artifact_resource_id);
    `);
  },
};
