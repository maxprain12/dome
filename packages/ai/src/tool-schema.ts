/**
 * Legacy OpenAI function-tool JSON schema shape (Dome tools / LangChain compat).
 */
export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
