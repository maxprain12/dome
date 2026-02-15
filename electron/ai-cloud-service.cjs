/**
 * AI Cloud Service - Handles API calls to cloud AI providers
 * This runs in the main process to avoid CORS issues
 */

// ============================================
// OPENAI
// ============================================

/**
 * Chat with OpenAI (or OpenAI-compatible endpoint)
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @param {string} baseURL - Base URL for API (default: https://api.openai.com)
 * @param {number} timeout - Timeout in ms (default: 30000)
 * @returns {Promise<string>}
 */
async function chatOpenAI(messages, apiKey, model = 'gpt-5.2', baseURL = 'https://api.openai.com', timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
      }),
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
async function streamOpenAI(messages, apiKey, model, onChunk, baseURL = 'https://api.openai.com', timeout = 120000, tools = undefined) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const body = {
    model,
    messages,
    temperature: 0.7,
    stream: true,
  };
  if (tools && Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }

  try {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
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

/**
 * Generate embeddings with OpenAI
 * @param {string[]} texts
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<number[][]>}
 */
async function embeddingsOpenAI(texts, apiKey, model = 'text-embedding-3-small') {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`OpenAI Embeddings error: ${response.status} - ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.data.map((item) => item.embedding);
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
async function chatAnthropic(messages, apiKey, model = 'claude-sonnet-4-5') {
  const systemMessage = messages.find((m) => m.role === 'system');
  const otherMessages = messages.filter((m) => m.role !== 'system');

  const body = {
    model,
    messages: otherMessages,
    max_tokens: 4096,
  };

  if (systemMessage) {
    body.system = systemMessage.content;
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
async function streamAnthropic(messages, apiKey, model, onChunk, tools) {
  const systemMessage = messages.find((m) => m.role === 'system');
  const otherMessages = messages.filter((m) => m.role !== 'system');

  const body = {
    model,
    messages: otherMessages,
    max_tokens: 4096,
    stream: true,
  };

  if (systemMessage) {
    body.system = systemMessage.content;
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
// GOOGLE GEMINI
// ============================================

/**
 * Chat with Google Gemini
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<string>}
 */
async function chatGoogle(messages, apiKey, model = 'gemini-3-flash') {
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

  const systemInstruction = messages.find((m) => m.role === 'system');

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
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
 * Convert OpenAI-format tools to Gemini functionDeclarations format
 * @param {Array} tools - OpenAI format: { type: 'function', function: { name, description, parameters } }
 * @returns {Array|undefined} Gemini format: { functionDeclarations: [...] } or undefined
 */
function convertToolsToGemini(tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return undefined;

  const functionDeclarations = tools.map((tool) => {
    if (tool.type === 'function' && tool.function) {
      const params = tool.function.parameters || { type: 'object', properties: {} };
      return {
        name: tool.function.name || 'unknown',
        description: tool.function.description || '',
        parameters: {
          type: params.type || 'object',
          properties: params.properties || {},
          required: params.required || [],
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
async function streamGoogle(messages, apiKey, model, onChunk, tools = undefined) {
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

  const systemInstruction = messages.find((m) => m.role === 'system');

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
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

/**
 * Generate embeddings with Google
 * @param {string[]} texts
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<number[][]>}
 */
async function embeddingsGoogle(texts, apiKey, model = 'text-embedding-004') {
  const embeddings = [];

  for (const text of texts) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Google Embedding error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    embeddings.push(data.embedding?.values ?? []);
  }

  return embeddings;
}

/**
 * Generate embeddings with Voyage AI (Anthropic's recommended embedding provider)
 * @param {string[]} texts
 * @param {string} apiKey - Anthropic/Voyage API key
 * @param {string} model - e.g. voyage-multimodal-3, voyage-3-large
 * @param {string} [inputType] - 'query' | 'document' for retrieval tasks (optional)
 * @returns {Promise<number[][]>}
 */
async function embeddingsVoyage(texts, apiKey, model = 'voyage-multimodal-3', inputType = 'document') {
  const body = { input: texts, model };
  if (inputType) body.input_type = inputType;

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Voyage Embeddings error: ${response.status} - ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.data.map((item) => item.embedding);
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
async function stream(provider, messages, apiKey, model, onChunk, tools = undefined) {
  switch (provider) {
    case 'openai':
      return streamOpenAI(messages, apiKey, model, onChunk, undefined, undefined, tools);
    case 'anthropic':
      return streamAnthropic(messages, apiKey, model, onChunk, tools);
    case 'google':
      return streamGoogle(messages, apiKey, model, onChunk, tools);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Generate embeddings with cloud provider
 * @param {string} provider
 * @param {string[]} texts
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<number[][]>}
 */
async function embeddings(provider, texts, apiKey, model) {
  switch (provider) {
    case 'openai':
      return embeddingsOpenAI(texts, apiKey, model);
    case 'anthropic':
      return embeddingsVoyage(texts, apiKey, model);
    case 'google':
      return embeddingsGoogle(texts, apiKey, model);
    default:
      throw new Error(`Provider ${provider} does not support embeddings`);
  }
}

module.exports = {
  // OpenAI
  chatOpenAI,
  streamOpenAI,
  embeddingsOpenAI,
  // Anthropic (direct API)
  chatAnthropic,
  streamAnthropic,
  embeddingsVoyage,
  // Google
  chatGoogle,
  streamGoogle,
  embeddingsGoogle,
  // Unified
  chat,
  stream,
  embeddings,
};
