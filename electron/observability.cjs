/**
 * Observability for LangGraph runs — supports Langfuse and LangSmith.
 *
 * Langfuse activation (self-host or cloud):
 *   LANGFUSE_PUBLIC_KEY=pk-...
 *   LANGFUSE_SECRET_KEY=sk-...
 *   LANGFUSE_BASEURL=http://localhost:3000   # or https://cloud.langfuse.com
 *
 * Langfuse trace size controls (optional):
 *   DOME_LANGFUSE_MASK=1                         # 0 = disable payload masking
 *   DOME_LANGFUSE_MAX_STRING_CHARS=4000          # truncate long strings per observation
 *   DOME_LANGFUSE_MAX_OBSERVATION_BYTES=131072   # hard cap per observation (~128KB)
 *   DOME_LANGFUSE_SAMPLE_RATE=1                  # 0–1 fraction of traces to ingest
 *   DOME_LANGFUSE_ENVIRONMENT=default              # Langfuse environment tag
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

const DEFAULT_MAX_STRING_CHARS = 4000;
const DEFAULT_MAX_OBSERVATION_BYTES = 131072;
const MASK_MAX_DEPTH = 12;
const MASK_ARRAY_HEAD_TAIL = 3;

function envDisabled(key) {
  const v = String(process.env[key] ?? '').toLowerCase().trim();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

function envPositiveInt(key, fallback) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envSampleRate(key, fallback) {
  const n = Number(process.env[key]);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function truncateString(text, maxChars) {
  if (typeof text !== 'string' || text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}...[truncated ${omitted} chars]`;
}

function maskValue(value, depth, maxStringChars, seen) {
  if (depth > MASK_MAX_DEPTH) return '[max depth]';
  if (value === null || value === undefined) return value;

  const valueType = typeof value;
  if (valueType === 'string') return truncateString(value, maxStringChars);
  if (valueType === 'number' || valueType === 'boolean') return value;
  if (valueType !== 'object') return String(value);

  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    if (value.length > MASK_ARRAY_HEAD_TAIL * 2 + 1) {
      const head = value
        .slice(0, MASK_ARRAY_HEAD_TAIL)
        .map((item) => maskValue(item, depth + 1, maxStringChars, seen));
      const tail = value
        .slice(-MASK_ARRAY_HEAD_TAIL)
        .map((item) => maskValue(item, depth + 1, maxStringChars, seen));
      const omitted = value.length - MASK_ARRAY_HEAD_TAIL * 2;
      return [...head, `[...${omitted} items omitted...]`, ...tail];
    }
    return value.map((item) => maskValue(item, depth + 1, maxStringChars, seen));
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = maskValue(nested, depth + 1, maxStringChars, seen);
  }
  return out;
}

function jsonByteLength(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function aggressiveTruncate(data, maxBytes, maxStringChars) {
  const smallerStringCap = Math.min(500, maxStringChars);
  const masked = maskValue(data, 0, smallerStringCap, new Set());
  if (jsonByteLength(masked) <= maxBytes) return masked;

  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.messages)) {
    const { messages, ...rest } = data;
    const restMasked = maskValue(rest, 0, smallerStringCap, new Set());
    return {
      ...restMasked,
      messages: `[${messages.length} messages omitted — payload exceeded ${maxBytes} bytes]`,
    };
  }

  return {
    _truncated: true,
    preview: truncateString(JSON.stringify(masked), Math.min(maxBytes, 2000)),
  };
}

/**
 * Build a Langfuse `mask` function that caps observation payload size before ingest.
 * @returns {(params: { data: unknown }) => unknown}
 */
function buildLangfuseMask() {
  const maxStringChars = envPositiveInt('DOME_LANGFUSE_MAX_STRING_CHARS', DEFAULT_MAX_STRING_CHARS);
  const maxObservationBytes = envPositiveInt(
    'DOME_LANGFUSE_MAX_OBSERVATION_BYTES',
    DEFAULT_MAX_OBSERVATION_BYTES,
  );

  return function langfuseMask({ data }) {
    try {
      const masked = maskValue(data, 0, maxStringChars, new Set());
      if (jsonByteLength(masked) <= maxObservationBytes) return masked;
      return aggressiveTruncate(data, maxObservationBytes, maxStringChars);
    } catch (err) {
      return { _maskError: true, message: String(err?.message || err) };
    }
  };
}

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
    /** @type {Record<string, unknown>} */
    const handlerOptions = {
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 1,
      flushInterval: 1000,
      environment: process.env.DOME_LANGFUSE_ENVIRONMENT || 'default',
      sampleRate: envSampleRate('DOME_LANGFUSE_SAMPLE_RATE', 1),
    };
    if (!envDisabled('DOME_LANGFUSE_MASK')) {
      handlerOptions.mask = buildLangfuseMask();
    }
    cachedHandler = new CallbackHandler(handlerOptions);
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

module.exports = {
  buildLangfuseMask,
  getLangfuseHandler,
  withLangfuseCallbacks,
  shutdownLangfuse,
  isObservabilityEnabled,
};
