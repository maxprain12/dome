// @dome/ai public API
// Multi-provider LLM layer (OpenAI, Anthropic, Google, Ollama, OpenRouter, Copilot).
// This package is Node-only — the renderer must not import it (R9).
//
// Phase 1: types-only. The runtime functions (chat, stream,
// createModelFromConfig) still live in `electron/llm-service.cjs` +
// `electron/model-factory.cjs` and are consumed by main-process callers
// directly. This package owns the **wire-format types** so that
// `@dome/agent-core`, `@dome/tools`, and the future pi-style runtime can
// all share one type authority.

export type {
  // Providers and models
  Provider,
  ModelConfig,
  Model,
  ModelCost,
  ModelInputType,
  // Messages
  Message,
  MessageRole,
  AssistantMessage,
  AssistantMessageEvent,
  ToolSchema,
  ToolCall,
  // Usage
  Usage,
  // Options
  StreamOptions,
  ChatOptions,
  ChatResult,
} from './types.js';
