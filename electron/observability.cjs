/**
 * Optional Langfuse tracing for LangGraph runs.
 *
 * Activation: set the env vars below before launching the app. If any are
 * missing, `getLangfuseHandler()` returns `null` and tracing is silently a
 * no-op — there is no overhead beyond a one-time check.
 *
 *   LANGFUSE_PUBLIC_KEY=pk-...
 *   LANGFUSE_SECRET_KEY=sk-...
 *   LANGFUSE_BASEURL=http://localhost:3000   # self-host or https://cloud.langfuse.com
 *
 * Note: `langfuse-langchain` declares a peer of `langchain >=0.0.157 <0.4.0`
 * but installs cleanly with `--legacy-peer-deps` against our `langchain@1.x`
 * because it only depends on the `@langchain/core` callback contract, which
 * is stable across the 1.x bump.
 */

let cachedHandler = undefined; // undefined = not yet probed; null = disabled

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
 * any) are preserved.
 */
function withLangfuseCallbacks(config) {
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

module.exports = { getLangfuseHandler, withLangfuseCallbacks, shutdownLangfuse };
