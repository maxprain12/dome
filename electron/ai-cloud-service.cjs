/**
 * AI Cloud Service - Handles API calls to cloud AI providers
 * This runs in the main process to avoid CORS issues
 */

// ============================================
// HELPERS (vision)
// ============================================

/**
 * @param {string} dataUrl
 * @returns {{ mimeType: string, base64: string } | null}
 */
function parseDataUrl(dataUrl) {
  const s = String(dataUrl || '');
  const m = s.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;
  return { mimeType: m[1].split(';')[0] || 'image/png', base64: m[2] };
}

/**
 * OpenAI/compatible vision user message parts (images + text)
 * @param {string} userText
 * @param {string[]} imageDataUrls
 * @returns {Array<{ type: string, text?: string, image_url?: { url: string } }>}
 */
function buildOpenAIImageUserContent(userText, imageDataUrls) {
  const content = [];
  for (const url of imageDataUrls || []) {
    if (url) content.push({ type: 'image_url', image_url: { url } });
  }
  content.push({ type: 'text', text: userText || '' });
  return content;
}

// ============================================
// OPENAI
// ============================================

/**
 * @typedef {{ responseFormat?: 'json_object', maxTokens?: number }} OpenAIRequestOptions
 */

/**
 * Chat with OpenAI (or OpenAI-compatible endpoint)
 * @param {Array<{role: string, content: string | unknown[]}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @param {string} baseURL - Base URL for API (default: https://api.openai.com)
 * @param {number} timeout - Timeout in ms (default: 30000)
 * @param {OpenAIRequestOptions} [openAIOptions]
 * @returns {Promise<string>}
 */
async function chatOpenAI(messages, apiKey, model = 'gpt-5.2', baseURL = 'https://api.openai.com', timeout = 30000, openAIOptions = undefined) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const body = {
    model,
    messages,
    temperature: 0.7,
  };
  if (openAIOptions?.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  if (Number.isFinite(openAIOptions?.maxTokens) && openAIOptions.maxTokens > 0) {
    body.max_tokens = openAIOptions.maxTokens;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && String(apiKey).trim().length) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - the server took too long to respond');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Stream chat with OpenAI (or OpenAI-compatible endpoint)
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @param {Function} onChunk - callback(string) or callback({ type, text?, toolCall? })
 * @param {string} baseURL - Base URL for API (default: https://api.openai.com)
 * @param {number} timeout - Timeout in ms (default: 120000 for streaming)
 * @param {Array} tools - Optional OpenAI-format tool definitions
 * @returns {Promise<string>}
 */
/**
 * @param {OpenAIRequestOptions} [streamOptions]
 */
async function streamOpenAI(messages, apiKey, model, onChunk, baseURL = 'https://api.openai.com', timeout = 120000, tools = undefined, streamOptions = undefined) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const body = {
    model,
    messages,
    temperature: 0.7,
    stream: true,
  };
  if (streamOptions?.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  if (Number.isFinite(streamOptions?.maxTokens) && streamOptions.maxTokens > 0) {
    body.max_tokens = streamOptions.maxTokens;
  }
  if (tools && Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && String(apiKey).trim().length) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    // Accumulate tool_calls by index (OpenAI streams tool_calls incrementally)
    const toolCallsAccumulator = [];
    let toolCallsEmitted = false;

    const emitChunk = (chunk) => {
      if (typeof onChunk === 'function') {
        if (typeof chunk === 'string') {
          onChunk({ type: 'text', text: chunk });
        } else {
          onChunk(chunk);
        }
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            const delta = event.choices?.[0]?.delta;
            if (!delta) continue;

            // Text content
            const text = delta.content;
            if (text) {
              fullResponse += text;
              emitChunk({ type: 'text', text });
            }

            // Tool calls - accumulate by index
            const toolCalls = delta.tool_calls;
            if (toolCalls && Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                const idx = tc.index;
                if (idx === undefined) continue;
                if (!toolCallsAccumulator[idx]) {
                  toolCallsAccumulator[idx] = { id: '', name: '', arguments: '' };
                }
                if (tc.id) toolCallsAccumulator[idx].id = tc.id;
                if (tc.function?.name) toolCallsAccumulator[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCallsAccumulator[idx].arguments += tc.function.arguments;
              }
            }

            // On finish, emit accumulated tool calls (once)
            const finishReason = event.choices?.[0]?.finish_reason;
            if (finishReason === 'tool_calls' && !toolCallsEmitted && toolCallsAccumulator.length > 0) {
              toolCallsEmitted = true;
              for (const tc of toolCallsAccumulator) {
                if (tc && tc.name) {
                  emitChunk({
                    type: 'tool_call',
                    toolCall: {
                      id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                      name: tc.name,
                      arguments: tc.arguments || '{}',
                    },
                  });
                }
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullResponse;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Stream timeout - the server took too long to respond');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// ANTHROPIC
// ============================================

/**
 * Chat with Anthropic Claude
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey - API key or OAuth token (both use x-api-key header)
 * @param {string} model
 * @returns {Promise<string>}
 */
/**
 * @param {Array<{ role: string, content: string | unknown }>} otherMessages
 */
function anthropicMessagesFromDomeFormat(otherMessages) {
  return otherMessages.map((m) => {
    if (m.role === 'user' && Array.isArray(m.content)) {
      const blocks = [];
      for (const part of m.content) {
        if (!part || typeof part !== 'object') continue;
        if (part.type === 'text' && part.text) {
          blocks.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const p = parseDataUrl(part.image_url.url);
          if (p) {
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: p.mimeType, data: p.base64 },
            });
          }
        }
      }
      return { role: m.role, content: blocks.length ? blocks : [{ type: 'text', text: '' }] };
    }
    return m;
  });
}

/**
 * @param {{ maxTokens?: number }} [anthOptions]
 */
async function chatAnthropic(messages, apiKey, model = 'claude-sonnet-4-5', anthOptions = undefined) {
  const systemMessage = messages.find((m) => m.role === 'system');
  const otherRaw = messages.filter((m) => m.role !== 'system');
  const otherMessages = anthropicMessagesFromDomeFormat(otherRaw);

  const body = {
    model,
    messages: otherMessages,
    max_tokens: Number.isFinite(anthOptions?.maxTokens) && anthOptions.maxTokens > 0 ? anthOptions.maxTokens : 4096,
  };

  if (systemMessage) {
    const sc = systemMessage.content;
    body.system = typeof sc === 'string' ? sc : String(sc || '');
  }

  // Both API keys (sk-ant-api03-...) and OAuth tokens (sk-ant-oat01-...) use x-api-key header
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * Stream chat with Anthropic Claude (with full tool support)
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey - API key or OAuth token (both use x-api-key header)
 * @param {string} model
 * @param {Function} onChunk - callback(data) where data is string or { type, text?, toolCall? }
 * @param {Array|undefined} tools - Anthropic-format tool definitions
 * @returns {Promise<string>}
 */
/**
 * @param {{ maxTokens?: number }} [anthStreamOptions]
 */
async function streamAnthropic(messages, apiKey, model, onChunk, tools, anthStreamOptions = undefined) {
  const systemMessage = messages.find((m) => m.role === 'system');
  const otherRaw = messages.filter((m) => m.role !== 'system');
  const otherMessages = anthropicMessagesFromDomeFormat(otherRaw);

  const body = {
    model,
    messages: otherMessages,
    max_tokens: Number.isFinite(anthStreamOptions?.maxTokens) && anthStreamOptions.maxTokens > 0 ? anthStreamOptions.maxTokens : 4096,
    stream: true,
  };

  if (systemMessage) {
    const sc = systemMessage.content;
    body.system = typeof sc === 'string' ? sc : String(sc || '');
  }

  // Add tools if provided
  if (tools && Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }

  // Both API keys (sk-ant-api03-...) and OAuth tokens (sk-ant-oat01-...) use x-api-key header
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';

  // Tool call tracking
  let currentToolCall = null;
  let toolInputJson = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);

        try {
          const event = JSON.parse(data);

          // Text content streaming
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullResponse += event.delta.text;
            onChunk({ type: 'text', text: event.delta.text });
          }

          // Tool use: content block start
          else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            currentToolCall = {
              id: event.content_block.id,
              name: event.content_block.name,
            };
            toolInputJson = '';
          }

          // Tool use: accumulate JSON input
          else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
            toolInputJson += event.delta.partial_json;
          }

          // Tool use: content block stop — emit the complete tool call
          else if (event.type === 'content_block_stop' && currentToolCall) {
            onChunk({
              type: 'tool_call',
              toolCall: {
                id: currentToolCall.id,
                name: currentToolCall.name,
                arguments: toolInputJson,
              },
            });
            currentToolCall = null;
            toolInputJson = '';
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullResponse;
}

// ============================================
// MINIMAX (OpenAI-compatible endpoint)
// ============================================

const { MINIMAX_BASE_URL } = require('./minimax-config.cjs');

/**
 * Chat with MiniMax via OpenAI-compatible endpoint
 * Uses Authorization: Bearer with sk-cp-... keys
 */
function chatMiniMax(messages, apiKey, model = 'MiniMax-M2.5') {
  return chatOpenAI(messages, apiKey, model, MINIMAX_BASE_URL);
}

/**
 * Stream chat with MiniMax via OpenAI-compatible endpoint.
 * Intercepts <think>...</think> blocks and emits them as { type: 'thinking' } chunks
 * so the UI can render them in the collapsible reasoning section.
 */
async function streamMiniMax(messages, apiKey, model, onChunk, tools) {
  let buffer = '';
  let inThinking = false;

  const interceptChunk = (data) => {
    if (!data || data.type !== 'text') {
      onChunk(data);
      return;
    }

    buffer += data.text;

    // Process buffer, emitting thinking and text chunks as tags are found
    while (true) {
      if (!inThinking) {
        const openIdx = buffer.indexOf('<think>');
        if (openIdx === -1) {
          // No opening tag — flush everything as text
          if (buffer.length > 0) {
            onChunk({ type: 'text', text: buffer });
            buffer = '';
          }
          break;
        }
        // Emit text before the tag
        if (openIdx > 0) {
          onChunk({ type: 'text', text: buffer.slice(0, openIdx) });
        }
        buffer = buffer.slice(openIdx + '<think>'.length);
        inThinking = true;
      } else {
        const closeIdx = buffer.indexOf('</think>');
        if (closeIdx === -1) {
          // Still inside thinking block — hold buffer (tag may be split)
          // But emit partial thinking if buffer is large enough to be safe
          const safeLen = buffer.length - '</think>'.length;
          if (safeLen > 0) {
            onChunk({ type: 'thinking', text: buffer.slice(0, safeLen) });
            buffer = buffer.slice(safeLen);
          }
          break;
        }
        // Emit full thinking block
        if (closeIdx > 0) {
          onChunk({ type: 'thinking', text: buffer.slice(0, closeIdx) });
        }
        buffer = buffer.slice(closeIdx + '</think>'.length);
        inThinking = false;
      }
    }
  };

  const result = await streamOpenAI(messages, apiKey, model, interceptChunk, MINIMAX_BASE_URL, 120000, tools, undefined);

  // Flush any remaining buffer
  if (buffer.length > 0) {
    onChunk({ type: inThinking ? 'thinking' : 'text', text: buffer });
  }

  return result;
}

// ============================================
// GOOGLE GEMINI
// ============================================

/**
 * Chat with Google Gemini
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<string>}
 */
/**
 * Map a chat message to Gemini content row (role + parts). Supports string or multimodal array (OpenAI-like).
 * @param {{ role: string, content: string | unknown }} msg
 */
function googleMessageToContentRow(msg) {
  const role = msg.role === 'assistant' ? 'model' : 'user';
  const c = msg.content;
  if (typeof c === 'string') {
    return { role, parts: [{ text: c }] };
  }
  if (Array.isArray(c)) {
    const parts = [];
    for (const block of c) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && block.text) {
        parts.push({ text: block.text });
      } else if (block.type === 'image_url' && block.image_url?.url) {
        const p = parseDataUrl(block.image_url.url);
        if (p) {
          parts.push({ inlineData: { mimeType: p.mimeType, data: p.base64 } });
        }
      }
    }
    if (parts.length === 0) parts.push({ text: '' });
    return { role, parts };
  }
  return { role, parts: [{ text: String(c ?? '') }] };
}

/**
 * @typedef {{ maxOutputTokens?: number, responseMimeType?: string }} GoogleGenOptions
 */

/**
 * @param {GoogleGenOptions} [genOptions]
 */
async function chatGoogle(messages, apiKey, model = 'gemini-3-flash', genOptions = undefined) {
  const other = messages.filter((m) => m.role !== 'system');
  const contents = other.map((msg) => googleMessageToContentRow(msg));

  const systemInstruction = messages.find((m) => m.role === 'system');
  const systemText = typeof systemInstruction?.content === 'string' ? systemInstruction.content : '';

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: genOptions?.maxOutputTokens && genOptions.maxOutputTokens > 0 ? genOptions.maxOutputTokens : 8192,
      ...(genOptions?.responseMimeType ? { responseMimeType: genOptions.responseMimeType } : {}),
    },
  };

  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Google Gemini API error: ${response.status} - ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Sanitize a JSON Schema for Gemini API compatibility.
 * Gemini rejects: const, additionalProperties, and some anyOf/oneOf patterns.
 * @param {object} schema - JSON Schema (will be cloned, not mutated)
 * @returns {object} Gemini-compatible schema
 */
function sanitizeSchemaForGemini(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};

  // Skip unsupported keywords (additionalProperties, $id, $schema)

  // Convert const to enum (Gemini supports enum, not const)
  if ('const' in schema) {
    out.type = schema.type || 'string';
    out.enum = [schema.const];
    if (schema.description) out.description = schema.description;
    return out;
  }

  // Convert anyOf/oneOf to Gemini-compatible format
  const union = schema.anyOf || schema.oneOf;
  if (Array.isArray(union) && union.length > 0) {
    const consts = union.filter((b) => b && typeof b === 'object' && 'const' in b).map((b) => b.const);
    const hasNull = union.some((b) => b && typeof b === 'object' && (b.type === 'null' || b.const === null));
    const firstNonNull = union.find((b) => b && typeof b === 'object' && b.type !== 'null' && !('const' in b && b.const === null));

    if (consts.length > 0) {
      out.type = 'string';
      out.enum = [...consts];
      if (hasNull) out.enum.push(null);
      if (schema.description) out.description = schema.description;
      return out;
    }
    if (firstNonNull) {
      const sanitized = sanitizeSchemaForGemini(firstNonNull);
      Object.assign(out, sanitized);
      if (schema.description && !out.description) out.description = schema.description;
      return out;
    }
    return { type: 'string', description: schema.description || '' };
  }

  // Copy supported fields
  if (schema.type) out.type = schema.type;
  if (schema.description) out.description = schema.description;
  if (schema.title) out.title = schema.title;
  if (schema.enum) out.enum = schema.enum;
  if (schema.minimum !== undefined) out.minimum = schema.minimum;
  if (schema.maximum !== undefined) out.maximum = schema.maximum;
  if (schema.default !== undefined) out.default = schema.default;

  // Recursively sanitize properties (objects)
  if (schema.properties && typeof schema.properties === 'object') {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out.properties[k] = sanitizeSchemaForGemini(v);
    }
  }

  // Recursively sanitize items (arrays)
  if (schema.items) {
    out.items = Array.isArray(schema.items)
      ? schema.items.map((item) => sanitizeSchemaForGemini(item))
      : sanitizeSchemaForGemini(schema.items);
  }

  if (Array.isArray(schema.required)) out.required = schema.required;

  return out;
}

/**
 * Convert OpenAI-format tools to Gemini functionDeclarations format
 * @param {Array} tools - OpenAI format: { type: 'function', function: { name, description, parameters } }
 * @returns {Array|undefined} Gemini format: { functionDeclarations: [...] } or undefined
 */
function convertToolsToGemini(tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return undefined;

  const functionDeclarations = tools.map((tool) => {
    if (tool.type === 'function' && tool.function) {
      const params = tool.function.parameters || { type: 'object', properties: {} };
      const sanitized = sanitizeSchemaForGemini(params);
      return {
        name: tool.function.name || 'unknown',
        description: tool.function.description || '',
        parameters: {
          type: sanitized.type || 'object',
          properties: sanitized.properties || {},
          required: sanitized.required || params.required || [],
        },
      };
    }
    return null;
  }).filter(Boolean);

  if (functionDeclarations.length === 0) return undefined;
  return [{ functionDeclarations }];
}

/**
 * Stream chat with Google Gemini
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @param {Function} onChunk - callback(string) or callback({ type, text?, toolCall? })
 * @param {Array} tools - Optional OpenAI-format tool definitions (converted to Gemini internally)
 * @returns {Promise<string>}
 */
/**
 * @param {GoogleGenOptions} [genOptions]
 */
async function streamGoogle(messages, apiKey, model, onChunk, tools = undefined, genOptions = undefined) {
  const other = messages.filter((m) => m.role !== 'system');
  const contents = other.map((msg) => googleMessageToContentRow(msg));

  const systemInstruction = messages.find((m) => m.role === 'system');
  const systemText = typeof systemInstruction?.content === 'string' ? systemInstruction.content : '';

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: genOptions?.maxOutputTokens && genOptions.maxOutputTokens > 0 ? genOptions.maxOutputTokens : 8192,
      ...(genOptions?.responseMimeType ? { responseMimeType: genOptions.responseMimeType } : {}),
    },
  };

  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const geminiTools = tools ? convertToolsToGemini(tools) : undefined;
  if (geminiTools) {
    body.tools = geminiTools;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Google Gemini API error: ${response.status} - ${error.error?.message || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';

  const emitChunk = (chunk) => {
    if (typeof onChunk === 'function') {
      if (typeof chunk === 'string') {
        onChunk({ type: 'text', text: chunk });
      } else {
        onChunk(chunk);
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);

        try {
          const event = JSON.parse(data);
          const parts = event.candidates?.[0]?.content?.parts;
          if (!parts || !Array.isArray(parts)) continue;

          for (const part of parts) {
            if (part.text) {
              fullResponse += part.text;
              emitChunk({ type: 'text', text: part.text });
            }
            if (part.functionCall) {
              const fc = part.functionCall;
              const args = typeof fc.args === 'object' ? JSON.stringify(fc.args || {}) : (fc.args || '{}');
              emitChunk({
                type: 'tool_call',
                toolCall: {
                  id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                  name: fc.name || 'unknown',
                  arguments: args,
                },
              });
            }
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullResponse;
}

// ============================================
// UNIFIED INTERFACE
// ============================================

/**
 * Chat with any cloud provider
 * @param {string} provider - 'openai' | 'anthropic' | 'google'
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<string>}
 */
async function chat(provider, messages, apiKey, model) {
  switch (provider) {
    case 'openai':
      return chatOpenAI(messages, apiKey, model);
    case 'anthropic':
      return chatAnthropic(messages, apiKey, model);
    case 'google':
      return chatGoogle(messages, apiKey, model);
    case 'minimax':
      return chatMiniMax(messages, apiKey, model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Stream chat with any cloud provider
 * @param {string} provider
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @param {Function} onChunk
 * @returns {Promise<string>}
 */
/**
 * @param {OpenAIRequestOptions} [streamOptions]
 */
/**
 * @typedef {{ responseFormat?: 'json_object', maxTokens?: number, maxOutputTokens?: number, responseMimeType?: string }} StreamExtraOptions
 */

/**
 * @param {StreamExtraOptions} [streamOptions]
 */
async function stream(provider, messages, apiKey, model, onChunk, tools = undefined, streamOptions = undefined) {
  switch (provider) {
    case 'openai':
      return streamOpenAI(messages, apiKey, model, onChunk, undefined, undefined, tools, streamOptions);
    case 'anthropic':
      return streamAnthropic(messages, apiKey, model, onChunk, tools, streamOptions);
    case 'google': {
      const gOpts = {
        maxOutputTokens: streamOptions?.maxOutputTokens || streamOptions?.maxTokens,
        responseMimeType: streamOptions?.responseMimeType,
      };
      return streamGoogle(messages, apiKey, model, onChunk, tools, gOpts);
    }
    case 'minimax':
      return streamMiniMax(messages, apiKey, model, onChunk, tools);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

module.exports = {
  // OpenAI
  chatOpenAI,
  streamOpenAI,
  // Anthropic (direct API)
  chatAnthropic,
  streamAnthropic,
  // MiniMax (Anthropic-compatible)
  chatMiniMax,
  streamMiniMax,
  // Google
  chatGoogle,
  streamGoogle,
  googleMessageToContentRow,
  // Shared helpers
  parseDataUrl,
  buildOpenAIImageUserContent,
  // Unified
  chat,
  stream,
};
