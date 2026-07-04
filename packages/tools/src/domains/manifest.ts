/**
 * Single source of truth for `dome_load_doc` ids and prompt paths.
 * Keep in sync with `electron/prompts/tool-prompt-loader.cjs` DOC_MANIFEST.
 */

export const DOME_LOAD_DOC_IDS = [
  'entity_rules',
  'artifacts',
  'artifact_persisted',
  'artifact_design',
  'feeders',
  'resource_links',
  'ppt_tool',
  'docx_tool',
  'calendar_tool',
  'flashcard_tool',
  'excel_notebook_tool',
  'excel_artifact_tool',
  'email_tool',
  'github_tool',
  'social_tool',
] as const;

export type DomeLoadDocId = (typeof DOME_LOAD_DOC_IDS)[number];

export const DOME_LOAD_DOC_DESCRIPTION =
  'Load a reference doc section on demand. Call BEFORE using tools that require it. Valid ids: ' +
  'entity_rules (before agent_create/workflow_create/automation_create/marketplace_install), ' +
  'artifacts (before emitting any artifact block), ' +
  'artifact_persisted (before artifact_create/artifact_update_state/artifact_delete), ' +
  'artifact_design (before artifact_create or artifact_design tool), ' +
  'feeders (before feeder_create/feeder_run), ' +
  'resource_links (if unsure about dome:// link format), ' +
  'ppt_tool (before ppt_create), ' +
  'docx_tool (before docx_create/docx_update), ' +
  'calendar_tool (before calendar_create_event), ' +
  'flashcard_tool (before flashcard_create), ' +
  'excel_notebook_tool (before Excel→notebook pandas flow), ' +
  'excel_artifact_tool (before Excel→artifact dashboard), ' +
  'email_tool (before email_list/email_search/email_send/email_reply), ' +
  'github_tool (before github_create_issue/github_create_milestone/github_update_issue), ' +
  'social_tool (before social_post_draft/social_post_publish).';

/** docId → relative path under domains/ or sections/ (runtime loader resolves). */
export const DOME_LOAD_DOC_PATHS: Record<DomeLoadDocId, string> = {
  entity_rules: 'sections/entity-rules.txt',
  resource_links: 'sections/resource-links.txt',
  artifacts: 'artifacts/prompt.txt',
  artifact_persisted: 'artifacts/prompt-persisted.txt',
  artifact_design: 'artifacts/prompt-design.txt',
  feeders: 'feeders/prompt.txt',
  ppt_tool: 'office/prompt-ppt.txt',
  docx_tool: 'office/prompt-docx.txt',
  calendar_tool: 'calendar/prompt.txt',
  flashcard_tool: 'flashcards/prompt.txt',
  excel_notebook_tool: 'office/prompt-excel-notebook.txt',
  excel_artifact_tool: 'office/prompt-excel-artifact.txt',
  email_tool: 'email/prompt.txt',
  github_tool: 'github/prompt.txt',
  social_tool: 'social/prompt.txt',
};
