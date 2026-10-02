/**
 * An OpenAI-style function tool definition — the shape produced today by
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()`. The registry turns
 * these into `AgentTool`s.
 */
export interface ToolDefinition {
  type?: 'function';
  function?: { name: string; description?: string; parameters?: Record<string, unknown> };
  /** Flat-style alternative (`{ name, description, parameters }`). */
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
}
