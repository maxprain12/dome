#!/usr/bin/env node
/**
 * Smoke test: multimodal vision across configured cloud providers.
 * Usage: node scripts/smoke/vision-providers.mjs [--provider openai] [--model gpt-4o-mini]
 *
 * Requires API keys in .env (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, MINIMAX_BENCH_API_KEY, etc.)
 */
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { loadDotenv } = require('../../electron/bench/load-env.cjs');
const llmService = require('../../electron/ai/llm-service.cjs');

loadDotenv();

/** 1×1 red PNG */
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const PROVIDER_CONFIGS = [
  { provider: 'openai', envKey: 'OPENAI_API_KEY', model: process.env.SMOKE_OPENAI_MODEL || 'gpt-4o-mini' },
  { provider: 'anthropic', envKey: 'ANTHROPIC_API_KEY', model: process.env.SMOKE_ANTHROPIC_MODEL || 'claude-haiku-4-5' },
  { provider: 'google', envKey: 'GOOGLE_API_KEY', model: process.env.SMOKE_GOOGLE_MODEL || 'gemini-2.5-flash-lite' },
  {
    provider: 'minimax',
    envKey: 'MINIMAX_BENCH_API_KEY',
    altEnvKeys: ['MINIMAX_API_KEY'],
    model: process.env.SMOKE_MINIMAX_MODEL || 'MiniMax-M3',
  },
  {
    provider: 'openrouter',
    envKey: 'OPENROUTER_BENCH_API_KEY',
    altEnvKeys: ['OPENROUTER_API_KEY'],
    model: process.env.SMOKE_OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  },
];

function parseArgs(argv) {
  const out = { provider: null, model: null, agentBaseline: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--provider' && argv[i + 1]) {
      out.provider = argv[++i];
    } else if (argv[i] === '--model' && argv[i + 1]) {
      out.model = argv[++i];
    } else if (argv[i] === '--agent-baseline') {
      out.agentBaseline = true;
    }
  }
  return out;
}

function resolveApiKey(cfg) {
  const primary = process.env[cfg.envKey];
  if (primary && String(primary).trim()) return primary.trim();
  for (const alt of cfg.altEnvKeys || []) {
    const v = process.env[alt];
    if (v && String(v).trim()) return v.trim();
  }
  return null;
}

async function smokeProvider(cfg, modelOverride) {
  const apiKey = resolveApiKey(cfg);
  if (!apiKey) {
    return { provider: cfg.provider, status: 'skipped', reason: `missing ${cfg.envKey}` };
  }
  const model = modelOverride || cfg.model;
  const userContent = llmService.buildImageContent(
    'Reply with exactly one word: red',
    [TINY_PNG_DATA_URL],
    { provider: cfg.provider, modelId: model },
  );
  const messages = [{ role: 'user', content: userContent }];
  try {
    const result = await llmService.chat({
      provider: cfg.provider,
      model,
      apiKey,
      messages,
      options: { maxTokens: 32 },
    });
    const text = String(result?.text || '').trim();
    if (!text) {
      return { provider: cfg.provider, model, status: 'fail', reason: 'empty response' };
    }
    return { provider: cfg.provider, model, status: 'ok', text: text.slice(0, 80) };
  } catch (err) {
    return {
      provider: cfg.provider,
      model,
      status: 'fail',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function agentBaselineCheck() {
  const { normalizeUserMessage } = require('../../electron/ai/message-multimodal.cjs');
  const markdown = `\n![test.png](${TINY_PNG_DATA_URL})\n\nDescribe this image briefly.`;
  const asString = normalizeUserMessage(markdown, { provider: 'openai', modelId: 'gpt-4o-mini' });
  const isNative = Array.isArray(asString);
  return {
    status: isNative ? 'ok' : 'legacy_string',
    note: isNative
      ? 'Markdown attachments convert to native content blocks'
      : 'Attachments still plain markdown string (pre-multimodal baseline)',
  };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('Dome multimodal vision smoke\n');

  if (args.agentBaseline) {
    const baseline = await agentBaselineCheck();
    console.log('Agent baseline:', baseline);
    return baseline.status === 'ok' ? 0 : 0;
  }

  const targets = args.provider
    ? PROVIDER_CONFIGS.filter((c) => c.provider === args.provider)
    : PROVIDER_CONFIGS;

  if (!targets.length) {
    console.error(`Unknown provider: ${args.provider}`);
    process.exit(1);
  }

  const results = [];
  for (const cfg of targets) {
    const result = await smokeProvider(cfg, args.model);
    results.push(result);
    const icon = result.status === 'ok' ? '✓' : result.status === 'skipped' ? '○' : '✗';
    console.log(
      `${icon} ${result.provider}${result.model ? ` (${result.model})` : ''}: ${result.status}${
        result.reason ? ` — ${result.reason}` : result.text ? ` — "${result.text}"` : ''
      }`,
    );
  }

  const failed = results.filter((r) => r.status === 'fail');
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
