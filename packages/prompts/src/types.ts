/**
 * @dome/prompts — public types.
 *
 * Phase 4: types extracted from the legacy CommonJS assembler. The runtime
 * bodies still live in `shared/prompt-assembler/index.cjs`; `assembler.ts`
 * re-exports them so callers have a single TypeScript entry point.
 */

/** Bump when prompt structure or core section semantics change (bench A/B). */
export const PROMPT_VERSION = 'minimax-v3';

/**
 * On-demand reference doc ids consumed by the `dome_load_doc` tool.
 * Mirrors `shared/prompt-assembler/index.cjs#DOME_LOAD_DOC_IDS` 1:1.
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

/** Description surfaced to the model for the `dome_load_doc` tool. */
export const DOME_LOAD_DOC_DESCRIPTION =
  'Load a reference doc section on demand. Call BEFORE using tools that require it. ' +
  'Valid ids: entity_rules (before agent_create/workflow_create/automation_create/marketplace_install), ' +
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

/**
 * Summary entry for the `<available_skills>` block injected into the
 * system prompt. Mirrors pi's `formatSkillsForSystemPrompt` signature.
 */
export interface SkillSummary {
  name: string;
  description: string;
  /** Optional path to the SKILL.md on disk. */
  path?: string;
  /** Optional source label (e.g. "bundled", "user"). */
  source?: string;
}

/** Options for `assembleSystemPrompt()`. */
export interface AssembleOptions {
  role: 'many' | 'agent' | 'team-supervisor' | 'workflow-node' | 'editor';
  contexts?: string[];
  skills?: SkillSummary[];
  toolSnippets?: Record<string, string>;
  cwd?: string;
  appendSystemPrompt?: string;
  language?: 'es' | 'en' | 'de' | 'it' | 'fr' | 'pt';
}

/** Re-export of the assembler version constant. */
export type PromptVersion = typeof PROMPT_VERSION;

/**
 * Core prompt sections supplied by the caller (loaded from disk in the
 * main process). The assembler is a pure function over these.
 */
export type CorePromptSections = {
  roleMany?: string;
  constraintsLanguage?: string;
  appContext?: string;
  toolGuardrails?: string;
  toolSurface?: string;
  toolFormat?: string;
  toolCatalog?: string;
  filesystemRules?: string;
  outputFormat?: string;
  referenceStub?: string;
};

export type DomeSystemPromptOptions = {
  staticPersona: string;
  volatileContext?: string | null;
  skillsCatalogMarkdown?: string | null;
  includeDate?: boolean;
  extraSections?: Array<string | null | undefined>;
  voiceLanguage?: string | null;
  omitCoreTools?: boolean;
  coreToolsMode?: 'full' | 'minimal';
};

export type VolatileSourceOptions = {
  uiContext?: string;
  userMemory?: string;
  pinnedResources?: Array<{ id: string; title: string; type: string }>;
  pinnedPeople?: Array<{
    id: string;
    title: string;
    identities?: Array<{ source: string; externalId: string; displayLabel?: string | null }>;
  }>;
  activeResource?: { id: string; title: string; type?: string } | null;
  dateLine?: string;
  taskLine?: string;
};

export type BenchPromptOptions = {
  intro: string;
  benchRules: string;
  toolsExcerpt?: string;
  fixtureList?: string;
  primaryTool?: string;
  explainOnly?: boolean;
};
