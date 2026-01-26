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
async function chatOpenAI(messages, apiKey, model = 'gpt-4o', baseURL = 'https://api.openai.com', timeout = 30000) {
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
 * @param {Function} onChunk - callback(text)
 * @param {string} baseURL - Base URL for API (default: https://api.openai.com)
 * @param {number} timeout - Timeout in ms (default: 120000 for streaming)
 * @returns {Promise<string>}
 */
async function streamOpenAI(messages, apiKey, model, onChunk, baseURL = 'https://api.openai.com', timeout = 120000) {
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
        stream: true,
      }),
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
            const text = event.choices?.[0]?.delta?.content;
            if (text) {
              fullResponse += text;
              onChunk(text);
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
async function chatAnthropic(messages, apiKey, model = 'claude-3-5-sonnet-20241022') {
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
 * Stream chat with Anthropic Claude
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey - API key or OAuth token (both use x-api-key header)
 * @param {string} model
 * @param {Function} onChunk - callback(text)
 * @returns {Promise<string>}
 */
async function streamAnthropic(messages, apiKey, model, onChunk) {
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
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullResponse += event.delta.text;
            onChunk(event.delta.text);
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
async function chatGoogle(messages, apiKey, model = 'gemini-2.0-flash') {
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
 * Stream chat with Google Gemini
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @param {Function} onChunk - callback(text)
 * @returns {Promise<string>}
 */
async function streamGoogle(messages, apiKey, model, onChunk) {
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
          const text = event.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullResponse += text;
            onChunk(text);
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
async function stream(provider, messages, apiKey, model, onChunk) {
  switch (provider) {
    case 'openai':
      return streamOpenAI(messages, apiKey, model, onChunk);
    case 'anthropic':
      return streamAnthropic(messages, apiKey, model, onChunk);
    case 'google':
      return streamGoogle(messages, apiKey, model, onChunk);
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
    case 'google':
      return embeddingsGoogle(texts, apiKey, model);
    default:
      throw new Error(`Provider ${provider} does not support embeddings`);
  }
}

// ============================================
// CLAUDE CLI DIRECT INTEGRATION
// For Claude Pro/Max subscriptions via Claude Code CLI
// Based on Clawdbot's implementation
// ============================================

const { spawn, spawnSync } = require('child_process');

/**
 * Map Anthropic model IDs to Claude CLI model IDs
 * @param {string} model - Anthropic model ID
 * @returns {string} - Claude CLI model ID
 */
function mapToCliModel(model) {
  // El Claude CLI acepta nombres largos directamente:
  // - claude-haiku-4-5, claude-sonnet-4-5, claude-opus-4-5
  // - haiku, sonnet, opus (aliases cortos)
  // Siguiendo el patron de clawdbot (normalizeCliModel), pasamos el modelo tal cual
  // El CLI resuelve internamente al modelo correcto
  return model;
}

/**
 * Check if Claude CLI is available and authenticated
 * @returns {Promise<boolean>}
 */
async function checkClaudeMaxProxy() {
  return new Promise((resolve) => {
    try {
      const result = spawnSync('claude', ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      resolve(result.status === 0);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Run Claude CLI command with timeout
 * Based on clawdbot's runCommandWithTimeout
 * @param {string[]} args - Command arguments
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function runClaudeCliCommand(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    // Limpiar variables de entorno que puedan interferir con Claude CLI
    // (como hace clawdbot en clearEnv)
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_API_KEY_OLD;

    const child = spawn('claude', args, {
      // stdin: 'ignore' porque no necesitamos enviar input
      // stdout/stderr: 'pipe' para capturar la salida
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      killed = true;
      child.kill('SIGKILL'); // SIGKILL como hace clawdbot
      reject(new Error('Claude CLI timeout - request took too long'));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killed) return;
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

/**
 * Parse Claude CLI JSON response
 * Based on Clawdbot's parseCliJson
 * @param {string} raw - Raw stdout from Claude CLI
 * @returns {string} - Extracted text response
 */
function parseCliResponse(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  
  try {
    const parsed = JSON.parse(trimmed);
    
    // Try different fields where response might be
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.content === 'string') return parsed.content;
    if (typeof parsed.result === 'string') return parsed.result;
    if (typeof parsed.text === 'string') return parsed.text;
    
    // Handle content array (like Anthropic API format)
    if (Array.isArray(parsed.content)) {
      const textBlocks = parsed.content
        .filter(block => block.type === 'text')
        .map(block => block.text);
      if (textBlocks.length > 0) return textBlocks.join('\n');
    }
    
    // Handle message object with content
    if (parsed.message && typeof parsed.message === 'object') {
      if (typeof parsed.message.content === 'string') return parsed.message.content;
      if (Array.isArray(parsed.message.content)) {
        const textBlocks = parsed.message.content
          .filter(block => block.type === 'text')
          .map(block => block.text);
        if (textBlocks.length > 0) return textBlocks.join('\n');
      }
    }
    
    return trimmed;
  } catch {
    // If not JSON, return raw text
    return trimmed;
  }
}

/**
 * Build prompt string from messages array
 * @param {Array<{role: string, content: string}>} messages
 * @returns {{prompt: string, systemPrompt?: string}}
 */
function buildCliPrompt(messages) {
  const systemMessage = messages.find(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');
  
  // Build conversation prompt
  const prompt = otherMessages
    .map(m => {
      if (m.role === 'user') return m.content;
      if (m.role === 'assistant') return `[Previous response]: ${m.content}`;
      return m.content;
    })
    .join('\n\n');
  
  return {
    prompt,
    systemPrompt: systemMessage?.content,
  };
}

/**
 * Chat with Anthropic Claude via Claude CLI
 * Based on Clawdbot's runCliAgent
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} model - Anthropic model ID
 * @returns {Promise<string>}
 */
async function chatAnthropicViaProxy(messages, model) {
  const cliModel = mapToCliModel(model);
  const { prompt, systemPrompt } = buildCliPrompt(messages);
  
  // Build CLI arguments: claude -p --output-format json --model <model> <prompt>
  const args = ['-p', '--output-format', 'json'];
  
  if (cliModel) {
    args.push('--model', cliModel);
  }
  
  if (systemPrompt) {
    args.push('--append-system-prompt', systemPrompt);
  }
  
  args.push(prompt);
  
  console.log(`[Claude CLI] Running: claude ${args.slice(0, -1).join(' ')} <prompt:${prompt.length} chars>`);
  
  const result = await runClaudeCliCommand(args, 180000);
  
  if (result.code !== 0) {
    const error = result.stderr || result.stdout || 'Claude CLI failed';
    throw new Error(`Claude CLI error (code ${result.code}): ${error}`);
  }
  
  const response = parseCliResponse(result.stdout);
  if (!response) {
    throw new Error('Claude CLI returned empty response');
  }
  
  return response;
}

/**
 * Stream chat with Anthropic Claude via Claude CLI
 * Note: Claude CLI doesn't support streaming, so we simulate it
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} model - Anthropic model ID
 * @param {Function} onChunk - callback(text)
 * @returns {Promise<string>}
 */
async function streamAnthropicViaProxy(messages, model, onChunk) {
  // Claude CLI doesn't support streaming, so we get full response and simulate streaming
  const response = await chatAnthropicViaProxy(messages, model);
  
  // Simulate streaming by sending chunks
  const chunkSize = 20; // characters per chunk
  for (let i = 0; i < response.length; i += chunkSize) {
    const chunk = response.slice(i, i + chunkSize);
    onChunk(chunk);
    // Small delay to simulate streaming
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  return response;
}

module.exports = {
  // OpenAI
  chatOpenAI,
  streamOpenAI,
  embeddingsOpenAI,
  // Anthropic (direct API)
  chatAnthropic,
  streamAnthropic,
  // Anthropic (via Claude CLI for subscriptions)
  checkClaudeMaxProxy, // Now checks Claude CLI availability
  chatAnthropicViaProxy, // Now uses Claude CLI directly
  streamAnthropicViaProxy, // Now uses Claude CLI directly
  mapToCliModel,
  // Google
  chatGoogle,
  streamGoogle,
  embeddingsGoogle,
  // Unified
  chat,
  stream,
  embeddings,
};
