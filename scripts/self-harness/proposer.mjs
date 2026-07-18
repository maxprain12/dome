import fs from 'node:fs';
import { createRequire } from 'node:module';
import { repoRead, repoSearch } from './policy.mjs';
import { validateProposal } from './schemas.mjs';

const require = createRequire(import.meta.url);
const { loadDotenv } = require('../../electron/bench/load-env.cjs');

function extractText(response) {
  if (typeof response?.content === 'string') return response.content;
  if (Array.isArray(response?.content)) {
    return response.content.filter((part) => part?.type === 'text').map((part) => part.text).join('');
  }
  return String(response?.content ?? response ?? '');
}

function parseJsonResponse(text) {
  const stripped = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error(`Proposer returned invalid JSON: ${stripped.slice(0, 500)}`);
  }
}

function resolveApiKey(provider) {
  const names = {
    minimax: ['MINIMAX_BENCH_API_KEY', 'MINIMAX_API_KEY'],
    openrouter: ['OPENROUTER_BENCH_API_KEY', 'OPENROUTER_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    google: ['GOOGLE_API_KEY'],
  }[provider] || [];
  for (const name of [...names, 'AI_API_KEY']) {
    if (process.env[name]) return process.env[name];
  }
  return undefined;
}

async function createChatModel(manifest) {
  loadDotenv();
  const { createModelFromConfig } = require('../../electron/ai/model-factory.cjs');
  return createModelFromConfig(
    manifest.provider,
    manifest.model,
    resolveApiKey(manifest.provider),
    manifest.baseUrl,
  );
}

function systemPrompt() {
  return `You are Dome improving the harness that currently governs your own behavior.
You may inspect only the declared editable harness surface through repo_search and repo_read.
Use evidence from repeated verifier-grounded failures, not intuition alone.
Propose one minimal patch addressing one reusable agent mechanism. Preserve unrelated behavior.
Never attempt to inspect or modify benchmarks, held-out cases, evaluators, CI, databases, IPC, renderer code, or this Self-Harness controller.

Reply with exactly one JSON object using one action:
{"action":"repo_search","query":"literal or regex","path":"allowed directory or file"}
{"action":"repo_read","path":"allowed file","startLine":1,"endLine":300}
{"action":"submit_patch","proposal":{"targetMechanism":"...","summary":"...","expectedEffect":"...","regressionRisks":["..."],"expectedTests":["..."],"patch":"unified git diff with a/ and b/ paths"}}

The submitted diff may touch at most 8 files and 200 added/deleted lines. Do not use markdown fences.`;
}

async function generateOne({ model, repoRoot, evidence, manifest, round, index, previous, maxSteps }) {
  const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');
  const transcript = [{
    role: 'user',
    content: JSON.stringify({
      experiment: { provider: manifest.provider, model: manifest.model, round, candidateIndex: index },
      evidence,
      alreadyProposed: previous.map(({ targetMechanism, summary }) => ({ targetMechanism, summary })),
    }),
  }];

  for (let step = 0; step < maxSteps; step += 1) {
    const messages = [new SystemMessage(systemPrompt()), ...transcript.map((entry) => new HumanMessage(entry.content))];
    const response = await model.invoke(messages);
    const action = parseJsonResponse(extractText(response));
    if (action.action === 'repo_search') {
      const output = repoSearch(repoRoot, action.query, action.path);
      transcript.push({ role: 'user', content: JSON.stringify({ toolResult: 'repo_search', output }) });
      continue;
    }
    if (action.action === 'repo_read') {
      const output = repoRead(repoRoot, action.path, action.startLine, action.endLine);
      transcript.push({ role: 'user', content: JSON.stringify({ toolResult: 'repo_read', output }) });
      continue;
    }
    if (action.action === 'submit_patch') {
      return validateProposal({
        id: `r${round}-c${index}`,
        ...action.proposal,
        regressionRisks: Array.isArray(action.proposal?.regressionRisks) ? action.proposal.regressionRisks : [],
        expectedTests: Array.isArray(action.proposal?.expectedTests) ? action.proposal.expectedTests : [],
      });
    }
    transcript.push({ role: 'user', content: JSON.stringify({ error: `Unknown action: ${action.action}` }) });
  }
  throw new Error(`Proposer exceeded ${maxSteps} controlled tool steps`);
}

export async function generateProposals({ repoRoot, evidence, manifest, round, width, maxSteps, mockFile }) {
  if (mockFile) {
    const proposals = JSON.parse(fs.readFileSync(mockFile, 'utf8'));
    return proposals.slice(0, width).map((proposal, index) => validateProposal({
      id: proposal.id || `r${round}-c${index + 1}`,
      ...proposal,
    }));
  }

  const model = await createChatModel(manifest);
  const proposals = [];
  for (let index = 1; index <= width; index += 1) {
    proposals.push(await generateOne({
      model,
      repoRoot,
      evidence,
      manifest,
      round,
      index,
      previous: proposals,
      maxSteps,
    }));
  }
  return proposals;
}
