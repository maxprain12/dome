'use strict';

/**
 * Native embeddings HTTP clients (no LangChain).
 * Duck-types the LangChain Embeddings interface: embedQuery / embedDocuments.
 */

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

function createOpenAIEmbeddings(apiKey, model) {
  const url = 'https://api.openai.com/v1/embeddings';
  async function embedBatch(input) {
    const data = await fetchJson(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input }),
    });
    const rows = Array.isArray(data?.data) ? data.data : [];
    rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return rows.map((r) => r.embedding);
  }
  return {
    embedQuery: async (text) => (await embedBatch(text))[0],
    embedDocuments: async (texts) => embedBatch(texts),
  };
}

function createGoogleEmbeddings(apiKey, model) {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent?key=${encodeURIComponent(apiKey)}`;
  async function embedOne(text) {
    const data = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelPath,
        content: { parts: [{ text: String(text ?? '') }] },
      }),
    });
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Google embeddings returned empty vector');
    }
    return values;
  }
  return {
    embedQuery: embedOne,
    embedDocuments: async (texts) => Promise.all(texts.map((t) => embedOne(t))),
  };
}

function createOllamaEmbeddings(baseUrl, model) {
  const root = String(baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const url = `${root}/api/embeddings`;
  async function embedOne(text) {
    const data = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: String(text ?? '') }),
    });
    const embedding = data?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Ollama embeddings returned empty vector');
    }
    return embedding;
  }
  return {
    embedQuery: embedOne,
    embedDocuments: async (texts) => Promise.all(texts.map((t) => embedOne(t))),
  };
}

/**
 * @param {{ provider: string, model: string, apiKey: string, baseUrl: string }} cfg
 */
function createEmbeddingsClient(cfg) {
  const { provider, model, apiKey, baseUrl } = cfg;
  if (provider === 'openai') return createOpenAIEmbeddings(apiKey, model);
  if (provider === 'google') return createGoogleEmbeddings(apiKey, model);
  if (provider === 'ollama') return createOllamaEmbeddings(baseUrl, model);
  throw new Error(`Unsupported embeddings provider: ${provider}`);
}

module.exports = { createEmbeddingsClient };
