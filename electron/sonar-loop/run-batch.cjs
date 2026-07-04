/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const agentRuntime = require('../agents/agent-runtime.cjs');
const { grantExternalPath } = require('../core/security.cjs');
const { getSonarLoopProviderConfig } = require('./provider-config.cjs');
const { buildSonarLoopMessages, getSonarLoopToolDefinitions } = require('./prompt.cjs');

function loadBatch(batchPath) {
  const resolved = path.resolve(batchPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Batch file not found: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

async function runSonarBatch(opts) {
  const repoRoot = path.resolve(opts.repoRoot);
  grantExternalPath(repoRoot, 4 * 60 * 60 * 1000);

  if (opts.dryRun) {
    const toolDefinitions = getSonarLoopToolDefinitions();
    return {
      dryRun: true,
      provider: opts.provider,
      model: opts.model,
      toolCount: toolDefinitions.length,
      repoRoot,
    };
  }

  const batchPayload = loadBatch(opts.batch);
  const providerConfig = await getSonarLoopProviderConfig(opts.provider, opts.model);
  const toolDefinitions = getSonarLoopToolDefinitions();
  const messages = buildSonarLoopMessages(batchPayload, repoRoot);
  const threadId = `sonar_loop_${crypto.randomUUID().slice(0, 8)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

  const chunks = [];
  let finalText = '';
  let error = null;

  console.log('[SonarLoop] provider:', providerConfig.provider, 'model:', providerConfig.model);
  console.log('[SonarLoop] batch issues:', (batchPayload.batch || []).length);
  console.log('[SonarLoop] repo:', repoRoot);

  try {
    const result = await agentRuntime.runAgent('sonar-loop', {
      provider: providerConfig.provider,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      messages,
      toolDefinitions,
      useDirectTools: true,
      skipHitl: true,
      threadId,
      signal: controller.signal,
      onChunk: (data) => {
        chunks.push({ ts: Date.now(), ...data });
        if (data?.type === 'text' && data.text) finalText += data.text;
      },
    });
    if (typeof result === 'string') finalText = result || finalText;
  } catch (err) {
    error = err?.name === 'AbortError'
      ? `Timeout after ${opts.timeoutMs}ms`
      : (err?.message || String(err));
    console.error('[SonarLoop] Agent error:', error);
  } finally {
    clearTimeout(timeout);
  }

  return {
    threadId,
    provider: providerConfig.provider,
    model: providerConfig.model,
    error,
    finalText,
    chunkCount: chunks.length,
    batch: batchPayload,
  };
}

module.exports = { runSonarBatch, loadBatch };
