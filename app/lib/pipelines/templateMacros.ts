export type PipelineMacroGroup = 'card' | 'pipeline' | 'advanced';

export interface PipelineTemplateMacro {
  key: string;
  group: PipelineMacroGroup;
  /** i18n key under pipelines.macro_* */
  labelKey: string;
}

export const PIPELINE_TEMPLATE_MACRO_GROUPS: PipelineMacroGroup[] = [
  'card',
  'pipeline',
  'advanced',
];

export const PIPELINE_TEMPLATE_MACROS: PipelineTemplateMacro[] = [
  { key: 'title', group: 'card', labelKey: 'macro_title' },
  { key: 'data', group: 'card', labelKey: 'macro_data' },
  { key: 'data.text', group: 'card', labelKey: 'macro_data_text' },
  { key: 'data.todos', group: 'card', labelKey: 'macro_data_todos' },
  { key: 'last_output', group: 'card', labelKey: 'macro_last_output' },
  { key: 'stage', group: 'pipeline', labelKey: 'macro_stage' },
  { key: 'pipeline', group: 'pipeline', labelKey: 'macro_pipeline' },
  { key: 'status', group: 'pipeline', labelKey: 'macro_status' },
  { key: 'start_at', group: 'pipeline', labelKey: 'macro_start_at' },
  { key: 'end_at', group: 'pipeline', labelKey: 'macro_end_at' },
  { key: 'activity', group: 'advanced', labelKey: 'macro_activity' },
  { key: 'context', group: 'advanced', labelKey: 'macro_context' },
];

export function macroToken(key: string): string {
  return `{{${key}}}`;
}
