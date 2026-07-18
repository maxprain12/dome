import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_LIMITS,
  EVALUATOR_VERSION,
  EXPERIMENTS_ROOT,
  REPO_ROOT,
  SCHEMA_VERSION,
} from './constants.mjs';
import {
  applyPatch,
  createWorktree,
  evaluateWorktree,
  gatesPassed,
  removeWorktree,
  runStaticGates,
} from './execution.mjs';
import {
  ensureDir,
  git,
  listCaseDefinitions,
  loadExperiment,
  readJson,
  resolveExperimentDir,
  sanitizeSlug,
  sha256,
  updateState,
  writeJson,
} from './io.mjs';
import { aggregateMetrics, evaluateCandidate, rankCandidates } from './metrics.mjs';
import { buildEvidenceBundle } from './mining.mjs';
import { validatePatch } from './policy.mjs';
import { generateProposals } from './proposer.mjs';
import { validateManifest, validateState } from './schemas.mjs';
import { SELF_HARNESS_SCHEMAS } from './schema-catalog.mjs';
import { createStratifiedSplit } from './split.mjs';

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function manifestWithoutHash(manifest) {
  const { manifestHash: ignored, ...rest } = manifest;
  return rest;
}

function assertManifestIntegrity(manifest) {
  validateManifest(manifest);
  if (sha256(manifestWithoutHash(manifest)) !== manifest.manifestHash) {
    throw new Error('Experiment manifest hash mismatch; refusing to continue');
  }
}

export function createExperiment(options) {
  ensureDir(EXPERIMENTS_ROOT);
  const cases = listCaseDefinitions();
  const seed = options.seed || `dome-${Date.now()}`;
  const splits = createStratifiedSplit(cases, seed, options.heldOutRatio ?? 0.3);
  const baseSha = options.baseSha || git(['rev-parse', 'HEAD']).stdout.trim();
  const id = options.id || `${timestampId()}-${sanitizeSlug(options.model)}`;
  const dir = resolveExperimentDir(id);
  if (fs.existsSync(dir)) throw new Error(`Experiment already exists: ${id}`);
  ensureDir(dir);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    id,
    createdAt: new Date().toISOString(),
    provider: options.provider,
    model: options.model,
    baseUrl: options.baseUrl || null,
    baseSha,
    evaluatorVersion: EVALUATOR_VERSION,
    seed,
    decoding: { temperature: options.temperature ?? null },
    budget: { maxTokens: options.maxTokens ?? null, maxCostUsd: options.maxCostUsd ?? null },
    rounds: options.rounds ?? 5,
    width: options.width ?? 4,
    repeats: options.repeats ?? 2,
    concurrency: options.concurrency ?? 1,
    limits: { ...DEFAULT_LIMITS, ...(options.limits || {}) },
    splits,
  };
  manifest.manifestHash = sha256(manifestWithoutHash(manifest));
  assertManifestIntegrity(manifest);
  writeJson(path.join(dir, 'manifest.json'), manifest);
  writeJson(path.join(dir, 'schemas.v1.json'), SELF_HARNESS_SCHEMAS);
  writeJson(path.join(dir, 'held-in.json'), splits.heldIn);
  writeJson(path.join(dir, 'held-out.json'), splits.heldOut);
  writeJson(path.join(dir, 'state.json'), {
    schemaVersion: SCHEMA_VERSION,
    experimentId: id,
    phase: 'baseline',
    round: 0,
    lineage: [],
    attempts: [],
    worktrees: [],
    createdAt: manifest.createdAt,
    updatedAt: manifest.createdAt,
  });
  return { dir, manifest };
}

function persistArtifact(dir, relativePath, value) {
  const filePath = path.join(dir, relativePath);
  writeJson(filePath, value);
  return filePath;
}

async function defaultEvaluate({ worktree, dir, manifest, candidateId, round, repeats }) {
  return evaluateWorktree({
    worktree,
    experimentDir: dir,
    manifest: { ...manifest, currentCandidate: candidateId, currentRound: round },
    repeats,
  });
}

async function defaultGates(worktree, manifest) {
  return runStaticGates(worktree, { timeoutMs: manifest.limits.candidateTimeoutMs });
}

const DEFAULT_ADAPTERS = {
  createWorktree,
  evaluate: defaultEvaluate,
  gates: defaultGates,
  generateProposals,
  removeWorktree,
};

function phase(dir, state, name, extra = {}) {
  return updateState(dir, state, { ...extra, phase: name, lastActivePhase: name });
}

export async function runExperiment(id, options = {}, injectedAdapters = {}) {
  const adapters = { ...DEFAULT_ADAPTERS, ...injectedAdapters };
  const loaded = loadExperiment(id);
  const { dir, manifest } = loaded;
  assertManifestIntegrity(manifest);
  let state = validateState(loaded.state);
  if (state.phase === 'completed' && !options.force) return { manifest, state };
  if (state.phase === 'failed') state = phase(dir, state, state.lastActivePhase || 'baseline', { error: null });

  const rounds = options.rounds ?? manifest.rounds;
  const width = options.width ?? manifest.width;
  const repeats = options.repeats ?? manifest.repeats;
  const mockFile = options.mockProposals ? path.resolve(options.mockProposals) : null;

  try {
    for (let round = state.round; round < rounds; round += 1) {
      const lineagePatches = state.lineage.map((entry) => entry.patch);
      state = phase(dir, state, 'baseline', { round });
      const activeWorktree = await adapters.createWorktree({
        baseSha: manifest.baseSha,
        experimentId: manifest.id,
        label: `r${round}-baseline`,
        patches: lineagePatches,
      });
      state = updateState(dir, state, { worktrees: [...state.worktrees, activeWorktree] });

      const baselineGates = options.skipGates ? [{ name: 'skipped', code: 0 }] : await adapters.gates(activeWorktree, manifest);
      persistArtifact(dir, `rounds/${round}/baseline-gates.json`, baselineGates);
      if (!gatesPassed(baselineGates)) throw new Error(`Active harness failed static gates in round ${round}`);

      const baselineRecords = await adapters.evaluate({
        worktree: activeWorktree, dir, manifest, candidateId: 'baseline', round, repeats,
      });
      const baselineMetrics = {
        heldIn: aggregateMetrics(baselineRecords.heldIn),
        heldOut: aggregateMetrics(baselineRecords.heldOut),
      };
      persistArtifact(dir, `rounds/${round}/baseline-metrics.json`, baselineMetrics);
      persistArtifact(dir, `rounds/${round}/baseline-held-in.json`, baselineRecords.heldIn);

      state = phase(dir, state, 'mining');
      const evidence = buildEvidenceBundle(baselineRecords.heldIn, state.attempts);
      persistArtifact(dir, `rounds/${round}/evidence-bundle.json`, evidence);

      state = phase(dir, state, 'proposing');
      const proposals = await adapters.generateProposals({
        repoRoot: activeWorktree,
        evidence,
        manifest,
        round,
        width,
        maxSteps: manifest.limits.proposalSteps,
        mockFile,
      });
      persistArtifact(dir, `rounds/${round}/proposals.json`, proposals);

      state = phase(dir, state, 'validating');
      const evaluations = [];
      for (const proposal of proposals) {
        const policy = validatePatch(proposal.patch, manifest.limits);
        if (!policy.valid) {
          evaluations.push({
            id: proposal.id,
            proposal,
            status: 'rejected',
            reason: `policy: ${policy.reasons.join('; ')}`,
            policy,
          });
          continue;
        }

        let candidateWorktree = null;
        try {
          candidateWorktree = await adapters.createWorktree({
            baseSha: manifest.baseSha,
            experimentId: manifest.id,
            label: proposal.id,
            patches: [...lineagePatches, proposal.patch],
          });
          state = updateState(dir, state, { worktrees: [...state.worktrees, candidateWorktree] });
          const gateResults = options.skipGates ? [{ name: 'skipped', code: 0 }] : await adapters.gates(candidateWorktree, manifest);
          if (!gatesPassed(gateResults)) {
            evaluations.push({ id: proposal.id, proposal, status: 'rejected', reason: 'static gate failed', policy, gates: gateResults });
            continue;
          }

          const records = await adapters.evaluate({
            worktree: candidateWorktree, dir, manifest, candidateId: proposal.id, round, repeats,
          });
          const metrics = {
            heldIn: aggregateMetrics(records.heldIn),
            heldOut: aggregateMetrics(records.heldOut),
          };
          const decision = evaluateCandidate({
            baselineIn: baselineMetrics.heldIn,
            baselineOut: baselineMetrics.heldOut,
            candidateIn: metrics.heldIn,
            candidateOut: metrics.heldOut,
            limits: manifest.limits,
          });
          const totalCandidateTokens = metrics.heldIn.totalTokens + metrics.heldOut.totalTokens;
          if (manifest.budget.maxTokens != null && totalCandidateTokens > manifest.budget.maxTokens) {
            decision.accepted = false;
            decision.reasons.push(`absolute token budget exceeded: ${totalCandidateTokens} > ${manifest.budget.maxTokens}`);
          }
          const totalCandidateCost = metrics.heldIn.totalCostUsd + metrics.heldOut.totalCostUsd;
          if (manifest.budget.maxCostUsd != null && totalCandidateCost > manifest.budget.maxCostUsd) {
            decision.accepted = false;
            decision.reasons.push(`absolute cost budget exceeded: ${totalCandidateCost} > ${manifest.budget.maxCostUsd}`);
          }
          evaluations.push({
            id: proposal.id,
            proposal,
            status: decision.accepted ? 'accepted' : 'rejected',
            reason: decision.accepted ? 'non-regressive improvement' : decision.reasons.join('; '),
            policy,
            gates: gateResults,
            metrics,
            decision,
            records: { heldIn: records.heldIn, heldOut: records.heldOut },
          });
        } catch (error) {
          evaluations.push({ id: proposal.id, proposal, status: 'rejected', reason: error.message, policy });
        }
      }
      persistArtifact(dir, `rounds/${round}/candidate-evaluations.json`, evaluations);

      state = phase(dir, state, 'merging');
      const accepted = evaluations.filter((entry) => entry.status === 'accepted').sort(rankCandidates);
      const winner = accepted[0] || null;
      const attempts = [
        ...state.attempts,
        ...evaluations.map(({ id: proposalId, status, reason }) => ({ id: proposalId, round, status, reason })),
      ];
      const lineage = winner
        ? [...state.lineage, {
          round,
          proposalId: winner.id,
          patch: winner.proposal.patch,
          patchHash: sha256(winner.proposal.patch),
          targetMechanism: winner.proposal.targetMechanism,
          decision: winner.decision,
        }]
        : state.lineage;
      persistArtifact(dir, `rounds/${round}/promotion-decision.json`, {
        schemaVersion: SCHEMA_VERSION,
        round,
        winner: winner?.id || null,
        accepted: accepted.map((entry) => entry.id),
        reason: winner ? 'highest-ranked non-regressive candidate' : 'no candidate passed promotion gates',
      });
      state = updateState(dir, state, { lineage, attempts, round: round + 1 });
    }

    state = phase(dir, state, 'completed', { completedAt: new Date().toISOString() });
    writeReport(id, { cleanup: false });
    return { manifest, state };
  } catch (error) {
    state = updateState(dir, state, { phase: 'failed', error: error.message });
    throw error;
  }
}

function reportRows(state) {
  if (!state.attempts.length) return ['| — | — | — | No proposals evaluated |'];
  return state.attempts.map((attempt) =>
    `| ${attempt.round} | ${attempt.id} | ${attempt.status} | ${String(attempt.reason || '').replaceAll('|', '\\|')} |`);
}

function readIfExists(filePath, fallback = null) {
  return fs.existsSync(filePath) ? readJson(filePath) : fallback;
}

function buildRoundReport(dir, state) {
  const metricRows = [];
  const caseChanges = [];
  const gateRows = [];
  for (let round = 0; round < state.round; round += 1) {
    const roundDir = path.join(dir, 'rounds', String(round));
    const baseline = readIfExists(path.join(roundDir, 'baseline-metrics.json'));
    const evaluations = readIfExists(path.join(roundDir, 'candidate-evaluations.json'), []);
    const promoted = state.lineage.find((entry) => entry.round === round);
    const winner = promoted ? evaluations.find((entry) => entry.id === promoted.proposalId) : null;
    if (baseline) {
      metricRows.push(`| ${round} | baseline | ${baseline.heldIn.passCount}/${baseline.heldIn.attempts} | ${baseline.heldOut.passCount}/${baseline.heldOut.attempts} | ${baseline.heldIn.totalTokens + baseline.heldOut.totalTokens} | ${(baseline.heldIn.totalCostUsd + baseline.heldOut.totalCostUsd).toFixed(6)} | ${Math.max(baseline.heldIn.p95DurationMs, baseline.heldOut.p95DurationMs)} |`);
    }
    if (winner?.metrics) {
      metricRows.push(`| ${round} | ${winner.id} | ${winner.metrics.heldIn.passCount}/${winner.metrics.heldIn.attempts} | ${winner.metrics.heldOut.passCount}/${winner.metrics.heldOut.attempts} | ${winner.metrics.heldIn.totalTokens + winner.metrics.heldOut.totalTokens} | ${(winner.metrics.heldIn.totalCostUsd + winner.metrics.heldOut.totalCostUsd).toFixed(6)} | ${Math.max(winner.metrics.heldIn.p95DurationMs, winner.metrics.heldOut.p95DurationMs)} |`);
      gateRows.push(`| ${round} | ${winner.id} | ${(winner.gates || []).every((gate) => gate.code === 0) ? 'PASS' : 'FAIL'} | ${(winner.gates || []).map((gate) => gate.name).join(', ')} |`);
      const baselineRecords = readIfExists(path.join(roundDir, 'baseline-held-in.json'), []);
      const baselineOutcomes = new Map(baselineRecords.map((record) => [record.caseId, record.outcome]));
      for (const record of winner.records?.heldIn || []) {
        const before = baselineOutcomes.get(record.caseId);
        if (before && before !== record.outcome) caseChanges.push(`- Round ${round} held-in \`${record.caseId}\`: ${before} → ${record.outcome}`);
      }
    }
  }
  return { metricRows, caseChanges, gateRows };
}

export function writeReport(id, options = {}) {
  const { dir, manifest, state } = loadExperiment(id);
  assertManifestIntegrity(manifest);
  const { metricRows, caseChanges, gateRows } = buildRoundReport(dir, state);
  const winningPatch = state.lineage.map((entry) => entry.patch.trim()).filter(Boolean).join('\n\n');
  if (winningPatch) fs.writeFileSync(path.join(dir, 'winning-lineage.patch'), `${winningPatch}\n`, 'utf8');
  const lines = [
    '# Dome Self-Harness Report',
    '',
    `- Experiment: \`${manifest.id}\``,
    `- Model: \`${manifest.provider}/${manifest.model}\``,
    `- Base commit: \`${manifest.baseSha}\``,
    `- Manifest hash: \`${manifest.manifestHash}\``,
    `- Phase: **${state.phase}**`,
    `- Completed rounds: ${state.round}/${manifest.rounds}`,
    `- Promoted edits: ${state.lineage.length}`,
    '',
    '## Evolution',
    '',
    '| Round | Candidate | Decision | Reason |',
    '|---:|---|---|---|',
    ...reportRows(state),
    '',
    '## Metrics',
    '',
    '| Round | Harness | Held-in pass | Held-out pass | Tokens | Cost USD | p95 ms |',
    '|---:|---|---:|---:|---:|---:|---:|',
    ...(metricRows.length ? metricRows : ['| — | — | — | — | — | — | — |']),
    '',
    'Cost is reported as 0 when the provider/model catalog does not expose pricing; token totals remain the portable comparison.',
    '',
    '## Case changes',
    '',
    ...(caseChanges.length ? caseChanges : ['No per-case outcome changes were recorded.']),
    '',
    '## Static gates for promoted candidates',
    '',
    '| Round | Candidate | Result | Gates |',
    '|---:|---|---|---|',
    ...(gateRows.length ? gateRows : ['| — | — | — | — |']),
    '',
    '## Winning lineage',
    '',
    ...(state.lineage.length ? state.lineage.map((entry) =>
      `- Round ${entry.round}: \`${entry.proposalId}\` — ${entry.targetMechanism} (patch \`${entry.patchHash.slice(0, 12)}\`)`) : ['No candidate was promoted.']),
    winningPatch ? '- Combined diff: `winning-lineage.patch`' : '',
    '',
    '## Reproduce',
    '',
    '```bash',
    `pnpm self-harness:resume -- --experiment ${manifest.id}`,
    `pnpm self-harness:report -- --experiment ${manifest.id}`,
    `pnpm self-harness:promote -- --experiment ${manifest.id}`,
    '```',
    '',
    'The final command creates a review branch only; it does not push, open a PR, or merge.',
    '',
  ];
  fs.writeFileSync(path.join(dir, 'report.md'), lines.join('\n'), 'utf8');
  if (options.cleanup) {
    for (const worktree of state.worktrees || []) removeWorktree(worktree);
    updateState(dir, state, { worktrees: [] });
  }
  return path.join(dir, 'report.md');
}

export async function promoteExperiment(id, options = {}) {
  const { dir, manifest, state } = loadExperiment(id);
  assertManifestIntegrity(manifest);
  if (state.phase !== 'completed') throw new Error('Only completed experiments can be promoted');
  if (!state.lineage.length) throw new Error('Experiment has no accepted harness changes');
  const branch = options.branch || `feat/self-harness-${sanitizeSlug(manifest.model)}-${sanitizeSlug(manifest.id)}`;
  const exists = git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true }).status === 0;
  if (exists) throw new Error(`Branch already exists: ${branch}`);
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-self-harness-promote-'));
  git(['worktree', 'add', '-b', branch, worktree, manifest.baseSha]);
  try {
    for (const entry of state.lineage) {
      applyPatch(worktree, entry.patch);
    }
    const changed = git(['diff', '--name-only'], { cwd: worktree }).stdout.trim().split('\n').filter(Boolean);
    if (!changed.length) throw new Error('Promotion produced no changes');
    git(['add', '--', ...changed], { cwd: worktree });
    git(['commit', '-m', `feat: promote Self-Harness experiment ${manifest.id}`], { cwd: worktree });
    const commit = git(['rev-parse', 'HEAD'], { cwd: worktree }).stdout.trim();
    const nextState = updateState(dir, state, { promotion: { branch, commit, promotedAt: new Date().toISOString() } });
    writeReport(id, { cleanup: false });
    return { branch, commit, state: nextState };
  } finally {
    git(['worktree', 'remove', '--force', worktree], { allowFailure: true });
  }
}

export function inspectExperiment(id) {
  return loadExperiment(id);
}
