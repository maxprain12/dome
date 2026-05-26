'use client';

export type FeederInterpreter = 'python3' | 'node' | 'bash' | 'sh' | 'curl';
export type FeederOutputMode = 'stdout_json' | 'output_file';
export type FeederUpdatePolicy = 'replace' | 'merge_shallow' | 'merge_deep' | 'append_array';
export type FeederTriggeredBy = 'agent' | 'user' | 'automation';

export type FeederEnvSecretRef = {
  envName: string;
  secretName: string;
};

export type FeederRecord = {
  id: string;
  artifactResourceId: string;
  slot: string;
  name: string;
  description: string;
  interpreter: FeederInterpreter;
  script: string;
  scriptHash: string;
  envSecretRefs: FeederEnvSecretRef[];
  envStatic: Record<string, string>;
  outputMode: FeederOutputMode;
  updatePolicy: FeederUpdatePolicy;
  timeoutMs: number;
  enabled: boolean;
  approved: boolean;
  approvedScriptHash: string | null;
  lastRunAt: number | null;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type FeederRunRecord = {
  id: string;
  feederId: string;
  startedAt: number;
  finishedAt: number | null;
  status: 'running' | 'completed' | 'failed';
  exitCode: number | null;
  stdoutExcerpt: string;
  stderrExcerpt: string;
  dataBytes: number;
  triggeredBy: FeederTriggeredBy;
  automationId: string | null;
};

export type FeederSecretMeta = {
  id: string;
  name: string;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type FeederCreateInput = {
  artifactResourceId: string;
  name: string;
  interpreter: FeederInterpreter;
  script: string;
  description?: string;
  slot?: string;
  envSecretRefs?: FeederEnvSecretRef[];
  envStatic?: Record<string, string>;
  outputMode?: FeederOutputMode;
  updatePolicy?: FeederUpdatePolicy;
  timeoutMs?: number;
};

export async function listFeeders(artifactResourceId: string) {
  return window.electron.feeders.list(artifactResourceId);
}

export async function listAllFeeders() {
  return window.electron.feeders.listAll();
}

export async function runFeeder(feederId: string, triggeredBy: FeederTriggeredBy = 'user') {
  return window.electron.feeders.run(feederId, triggeredBy);
}

export async function approveFeeder(feederId: string) {
  return window.electron.feeders.approve(feederId);
}

export async function deleteFeeder(feederId: string) {
  return window.electron.feeders.delete(feederId);
}

export async function getFeederHistory(feederId: string, limit = 20) {
  return window.electron.feeders.history(feederId, limit);
}

export async function listFeederSecrets() {
  return window.electron.feeders.secrets.list();
}

export async function setFeederSecret(name: string, value: string) {
  return window.electron.feeders.secrets.set(name, value);
}

export async function deleteFeederSecret(secretId: string) {
  return window.electron.feeders.secrets.delete(secretId);
}

export async function getFeederVaultStatus() {
  return window.electron.feeders.secrets.vaultStatus();
}
