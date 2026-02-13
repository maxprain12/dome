/* eslint-disable no-console */
/**
 * Ollama Service Module - Main Process
 * Handles communication with Ollama API for embeddings and text generation
 */

const http = require('http');
const https = require('https');

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_EMBEDDING_MODEL = 'mxbai-embed-large';
const DEFAULT_MODEL = 'llama3.2';

/**
 * Make HTTP request
 * @param {string} url - Request URL
 * @param {object} options - Request options
 * @returns {Promise<object>} Response data
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${jsonData.error || data}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Check if Ollama is available
 * @param {string} baseUrl - Ollama base URL
 * @returns {Promise<boolean>} True if available
 */
async function checkAvailability(baseUrl = DEFAULT_BASE_URL) {
  try {
    const response = await makeRequest(`${baseUrl}/api/tags`);
    return response && Array.isArray(response.models);
  } catch (error) {
    console.error('[OllamaService] Ollama not available:', error.message);
    return false;
  }
}

/**
 * Generate embedding using Ollama
 * @param {string} text - Text to embed
 * @param {string} model - Embedding model name
 * @param {string} baseUrl - Ollama base URL
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateEmbedding(text, model = DEFAULT_EMBEDDING_MODEL, baseUrl = DEFAULT_BASE_URL) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    console.log(`[OllamaService] Generating embedding with model: ${model}`);

    const response = await makeRequest(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      body: {
        model,
        prompt: text
      }
    });

    if (response.embedding && Array.isArray(response.embedding)) {
      console.log(`[OllamaService] Generated embedding (${response.embedding.length} dimensions)`);
      return response.embedding;
    }

    throw new Error('Invalid response from Ollama API');
  } catch (error) {
    console.error('[OllamaService] Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate summary using Ollama
 * @param {string} text - Text to summarize
 * @param {string} model - Model name
 * @param {string} baseUrl - Ollama base URL
 * @returns {Promise<string>} Summary text
 */
async function generateSummary(text, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Truncate text if too long (Ollama has token limits)
    const maxLength = 8000; // Approximate token limit
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

    console.log(`[OllamaService] Generating summary with model: ${model}`);

    const prompt = `Resume el siguiente contenido de manera concisa y clara, destacando los puntos principales. El resumen debe ser útil para entender el contenido sin necesidad de leer el texto completo.
IMPORTANTE: Ignora cualquier mención de cookies, consentimiento, banners de privacidad o elementos de navegación. Enfócate solo en el contenido principal del artículo.

Contenido:
${truncatedText}

Resumen:`;

    const response = await makeRequest(`${baseUrl}/api/generate`, {
      method: 'POST',
      body: {
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 500 // Limit summary length
        }
      }
    });

    if (response.response) {
      const summary = response.response.trim();
      console.log(`[OllamaService] Generated summary (${summary.length} chars)`);
      return summary;
    }

    throw new Error('Invalid response from Ollama API');
  } catch (error) {
    console.error('[OllamaService] Error generating summary:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts
 * @param {string[]} texts - Array of texts to embed
 * @param {string} model - Embedding model name
 * @param {string} baseUrl - Ollama base URL
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function generateEmbeddings(texts, model = DEFAULT_EMBEDDING_MODEL, baseUrl = DEFAULT_BASE_URL) {
  const embeddings = [];

  for (const text of texts) {
    try {
      const embedding = await generateEmbedding(text, model, baseUrl);
      embeddings.push(embedding);
    } catch (error) {
      console.error(`[OllamaService] Error embedding text:`, error);
      // Continue with next text
      embeddings.push(null);
    }
  }

  return embeddings;
}

/**
 * List available models from Ollama
 * @param {string} baseUrl - Ollama base URL
 * @returns {Promise<Array<{name: string, size: number, modified_at: string}>>} Array of available models
 */
async function listModels(baseUrl = DEFAULT_BASE_URL) {
  try {
    const response = await makeRequest(`${baseUrl}/api/tags`);

    if (response && Array.isArray(response.models)) {
      return response.models.map((model) => ({
        name: model.name,
        size: model.size || 0,
        modified_at: model.modified_at || '',
      }));
    }

    return [];
  } catch (error) {
    console.error('[OllamaService] Error listing models:', error);
    throw error;
  }
}

/**
 * Chat with Ollama
 * @param {Array<{role: string, content: string}>} messages - Chat messages
 * @param {string} model - Model name
 * @param {string} baseUrl - Ollama base URL
 * @returns {Promise<string>} Response content
 */
async function chat(messages, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL) {
  try {
    if (!messages || messages.length === 0) {
      throw new Error('Messages cannot be empty');
    }

    console.log(`[OllamaService] Chatting with model: ${model}`);

    // Non-streaming for now to simplify IPC
    const response = await makeRequest(`${baseUrl}/api/chat`, {
      method: 'POST',
      body: {
        model,
        messages,
        stream: false,
        options: {
          temperature: 0.7
        }
      }
    });

    if (response.message && response.message.content) {
      return response.message.content;
    }

    throw new Error('Invalid response from Ollama API');
  } catch (error) {
    console.error('[OllamaService] Error in chat:', error);
    throw error;
  }
}

/**
 * Convert OpenAI-format tools to Ollama format.
 * Ollama expects: { type: 'function', function: { name, description, parameters } }
 * @param {Array} tools - OpenAI-format tool definitions
 * @returns {Array|undefined} Ollama-format tools
 */
function convertToolsToOllama(tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return undefined;

  return tools.map((tool) => {
    if (tool.type === 'function' && tool.function) {
      return {
        type: 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description || '',
          parameters: tool.function.parameters || { type: 'object', properties: {} },
        },
      };
    }
    return tool;
  });
}

/**
 * Chat with Ollama (streaming)
 * @param {Array<{role: string, content: string}>} messages - Chat messages
 * @param {string} model - Model name
 * @param {string} baseUrl - Ollama base URL
 * @param {function} onChunk - Callback for each chunk: onChunk({ type: 'text', text }) or onChunk({ type: 'tool_call', toolCall: { id, name, arguments } })
 * @param {object} opts - Optional: { temperature, top_p, num_predict, think, tools }
 * @returns {Promise<string>} Full response content
 */
function chatStream(messages, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL, onChunk, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!messages || messages.length === 0) {
      reject(new Error('Messages cannot be empty'));
      return;
    }

    const ollamaTools = opts.tools ? convertToolsToOllama(opts.tools) : undefined;
    console.log(`[OllamaService] Chat streaming with model: ${model}, tools: ${ollamaTools ? ollamaTools.length : 0}`);

    const urlObj = new URL(`${baseUrl}/api/chat`);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const body = {
      model,
      messages,
      stream: true,
      think: opts.think ?? false,
      options: {
        temperature: opts.temperature ?? 0.7,
        top_p: opts.top_p ?? 0.9,
        num_predict: opts.num_predict ?? 500,
      },
    };
    if (ollamaTools && ollamaTools.length > 0) {
      body.tools = ollamaTools;
    }

    const postData = JSON.stringify(body);

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = protocol.request(requestOptions, (res) => {
      if (res.statusCode >= 400) {
        let errorBody = '';
        res.on('data', (c) => { errorBody += c.toString(); });
        res.on('end', () => {
          try {
            const err = JSON.parse(errorBody);
            reject(new Error(err.error || `HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${errorBody}`));
          }
        });
        return;
      }

      let buffer = '';
      let fullContent = '';
      const toolCallsAccumulator = [];

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message) {
              if (opts.think && json.message.thinking && typeof onChunk === 'function') {
                onChunk({ type: 'text', text: json.message.thinking });
                fullContent += json.message.thinking;
              }
              if (json.message.content && typeof onChunk === 'function') {
                onChunk({ type: 'text', text: json.message.content });
                fullContent += json.message.content;
              }
              // Ollama supports tool_calls in streaming - forward to renderer
              if (json.message.tool_calls && Array.isArray(json.message.tool_calls) && typeof onChunk === 'function') {
                for (const tc of json.message.tool_calls) {
                  const fn = tc.function || tc;
                  const toolId = tc.id || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                  const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {});
                  onChunk({
                    type: 'tool_call',
                    toolCall: {
                      id: toolId,
                      name: fn.name || 'unknown',
                      arguments: args,
                    },
                  });
                }
              }
            }
            if (json.done) {
              resolve(fullContent);
              return;
            }
          } catch (e) {
            // Skip malformed JSON lines
          }
        }
      });

      res.on('end', () => {
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.message?.content) {
              fullContent += json.message.content;
              if (typeof onChunk === 'function') {
                onChunk({ type: 'text', text: json.message.content });
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
        resolve(fullContent);
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = {
  checkAvailability,
  generateEmbedding,
  generateEmbeddings,
  generateSummary,
  chat,
  chatStream,
  listModels,
  DEFAULT_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_MODEL
};
