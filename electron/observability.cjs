/**
 * Observability for LangGraph runs — supports Langfuse and LangSmith.
 *
 * Langfuse activation (self-host or cloud):
 *   LANGFUSE_PUBLIC_KEY=pk-...
 *   LANGFUSE_SECRET_KEY=sk-...
 *   LANGFUSE_BASEURL=http://localhost:3000   # or https://cloud.langfuse.com
 *
 * LangSmith activation (https://smith.langchain.com):
 *   LANGCHAIN_TRACING_V2=true
 *   LANGCHAIN_API_KEY=ls__...
 *   LANGCHAIN_PROJECT=dome               # optional project name
 *   LANGCHAIN_ENDPOINT=https://api.smith.langchain.com  # optional, defaults to public
 *
 * If none are configured, tracing is silently a no-op.
 */

let cachedHandler = undefined; // undefined = not yet probed; null = disabled
let langSmithEnabled = undefined; // undefined = not yet checked

// ---------------------------------------------------------------------------
// LangSmith — env-var activation wires up OTEL-compatible tracing via
// LANGCHAIN_TRACING_V2. No additional callback is needed; LangChain/LangGraph
// picks up the env vars automatically at first invocation.
// ---------------------------------------------------------------------------
function initLangSmith() {
  if (langSmithEnabled !== undefined) return langSmithEnabled;
  const tracingEnabled = process.env.LANGCHAIN_TRACING_V2 === 'true';
  const apiKey = process.env.LANGCHAIN_API_KEY;
  if (tracingEnabled && apiKey) {
    langSmithEnabled = true;
    // Ensure LANGCHAIN_ENDPOINT defaults to public Smith if not set
    if (!process.env.LANGCHAIN_ENDPOINT) {
      process.env.LANGCHAIN_ENDPOINT = 'https://api.smith.langchain.com';
    }
    const project = process.env.LANGCHAIN_PROJECT || 'dome';
    console.log(`[Observability] LangSmith tracing enabled → project: ${project}`);
  } else {
    langSmithEnabled = false;
  }
  return langSmithEnabled;
}

// ---------------------------------------------------------------------------
// Langfuse
// ---------------------------------------------------------------------------
function getLangfuseHandler() {
  if (cachedHandler !== undefined) return cachedHandler;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  // Accept LANGFUSE_BASEURL (Langfuse SDK convention), LANGFUSE_BASE_URL
  // (common typo) and LANGFUSE_HOST (alternative naming).
  const baseUrl =
    process.env.LANGFUSE_BASEURL ||
    process.env.LANGFUSE_BASE_URL ||
    process.env.LANGFUSE_HOST;

  if (!publicKey || !secretKey || !baseUrl) {
    cachedHandler = null;
    return null;
  }

  try {
    const { CallbackHandler } = require('langfuse-langchain');
    cachedHandler = new CallbackHandler({
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 1,
      flushInterval: 1000,
    });
    console.log('[Observability] Langfuse handler enabled →', baseUrl);
    return cachedHandler;
  } catch (err) {
    console.warn('[Observability] Failed to init Langfuse:', err?.message || err);
    cachedHandler = null;
    return null;
  }
}

/**
 * Merge Langfuse callbacks into a LangGraph `config`. Existing callbacks (if
 * any) are preserved. LangSmith is activated via env vars automatically.
 */
function withLangfuseCallbacks(config) {
  // Activate LangSmith on first use (idempotent after first call)
  initLangSmith();
  const handler = getLangfuseHandler();
  if (!handler) return config;
  const existing = Array.isArray(config?.callbacks) ? config.callbacks : [];
  return { ...config, callbacks: [...existing, handler] };
}

async function shutdownLangfuse() {
  if (cachedHandler && typeof cachedHandler.shutdownAsync === 'function') {
    try {
      await cachedHandler.shutdownAsync();
    } catch (err) {
      console.warn('[Observability] Langfuse shutdown error:', err?.message || err);
    }
  }
}

/** Returns true if any observability backend is active. */
function isObservabilityEnabled() {
  return initLangSmith() || !!getLangfuseHandler();
}

module.exports = { getLangfuseHandler, withLangfuseCallbacks, shutdownLangfuse, isObservabilityEnabled };
