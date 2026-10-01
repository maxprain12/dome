
'use strict';

const KEY = 'research_acquisition_ledger_v1';
const POLICY_KEY = 'research_acquisition_policy_v1';
const DEFAULT_POLICY = { enabledProviders: [], perRunUsd: 0.25, monthlyUsd: 10 };
const PRICES = { brave: 0.005, tavily: 0.008, exa: 0.007 };

function readJson(queries, key, fallback) {
  const value = queries.getSetting.get(key)?.value;
  if (!value) return structuredClone(fallback);
  return JSON.parse(value);
}

function policy(queries) {
  return require('./schemas.cjs').Policy.parse({ ...DEFAULT_POLICY, ...readJson(queries, POLICY_KEY, DEFAULT_POLICY) });
}

function ledger(queries, now = Date.now()) {
  const month = new Date(now).toISOString().slice(0, 7);
  const stored = readJson(queries, KEY, { month, spent: 0, runs: {} });
  return stored.month === month ? stored : { month, spent: 0, runs: {} };
}

// Synchronous read/reserve/write on the main process, before any network await.
// Failed/aborted requests remain charged conservatively: providers may bill them.
function reserve(queries, runId, provider, amount = PRICES[provider]) {
  const config = policy(queries);
  if (!config.enabledProviders.includes(provider)) throw new Error('provider_not_enabled');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('unknown_acquisition_price');
  const state = ledger(queries);
  const current = Object.hasOwn(state.runs, runId) ? state.runs[runId] : 0;
  if (!Number.isFinite(state.spent) || state.spent < 0 || !Number.isFinite(current) || current < 0) throw new Error('invalid_acquisition_ledger');
  if (current + amount > config.perRunUsd + 1e-9) throw new Error('run_budget_exceeded');
  if (state.spent + amount > config.monthlyUsd + 1e-9) throw new Error('monthly_budget_exceeded');
  state.spent += amount;
  state.runs[runId] = current + amount;
  queries.setSetting.run(KEY, JSON.stringify(state), Date.now());
  return { provider, estimatedUsd: amount, runEstimatedUsd: state.runs[runId], monthlyEstimatedUsd: state.spent };
}

module.exports = { policy, ledger, reserve, PRICES, DEFAULT_POLICY, POLICY_KEY };
