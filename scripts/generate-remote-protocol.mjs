#!/usr/bin/env node
/**
 * Remote Many protocol contract.
 *
 * Canonical source: shared/remote-many/protocol.json
 *   pnpm run generate:remote-protocol   write shared/remote-many/protocol.ts
 *   pnpm run check:remote-protocol      CI: fail if CJS / TS / docs drift
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const SPEC_REL = 'shared/remote-many/protocol.json';
export const TS_REL = 'shared/remote-many/protocol.ts';
export const CJS_REL = 'electron/remote/protocol.cjs';
export const EXECUTOR_REL = 'electron/remote/executor.cjs';
export const DOCS_REL = 'docs/architecture/remote-many.md';

const SPEC_PATH = path.join(ROOT, SPEC_REL);
const TS_PATH = path.join(ROOT, TS_REL);
const CJS_PATH = path.join(ROOT, CJS_REL);
const EXECUTOR_PATH = path.join(ROOT, EXECUTOR_REL);
const DOCS_PATH = path.join(ROOT, DOCS_REL);

/** @typedef {{ name: string, version: number, hkdfInfo: string, maxEnvelopeBytes: number, commandTtlMs: number, eventTtlMs: number, heartbeatMs: number, onlineWindowMs: number, pairingTtlMs: number, agentModes: string[], commandTypes: string[], eventTypes: string[] }} ProtocolSpec */

/**
 * @param {string} filePath
 * @returns {ProtocolSpec}
 */
export function loadSpec(filePath = SPEC_PATH) {
  const spec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assertSpec(spec, filePath);
  return spec;
}

/**
 * @param {unknown} spec
 * @param {string} label
 */
export function assertSpec(spec, label = 'spec') {
  if (!spec || typeof spec !== 'object') throw new Error(`${label}: not an object`);
  const row = /** @type {Record<string, unknown>} */ (spec);
  const requiredStrings = ['name', 'hkdfInfo'];
  for (const key of requiredStrings) {
    if (typeof row[key] !== 'string' || !row[key]) {
      throw new Error(`${label}: missing string ${key}`);
    }
  }
  const requiredNumbers = [
    'version',
    'maxEnvelopeBytes',
    'commandTtlMs',
    'eventTtlMs',
    'heartbeatMs',
    'onlineWindowMs',
    'pairingTtlMs',
  ];
  for (const key of requiredNumbers) {
    if (typeof row[key] !== 'number' || !Number.isFinite(row[key])) {
      throw new Error(`${label}: missing number ${key}`);
    }
  }
  for (const key of ['agentModes', 'commandTypes', 'eventTypes']) {
    if (!Array.isArray(row[key]) || row[key].length === 0) {
      throw new Error(`${label}: missing ${key}`);
    }
    if (row[key].some((item) => typeof item !== 'string' || !item)) {
      throw new Error(`${label}: ${key} must be non-empty strings`);
    }
  }
}

/**
 * @param {string[]} values
 */
export function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string[]} expected
 * @param {string[]} actual
 * @param {string} label
 * @returns {string[]}
 */
export function diffLists(expected, actual, label) {
  const want = new Set(expected);
  const got = new Set(actual);
  /** @type {string[]} */
  const errors = [];
  for (const value of uniqueSorted(expected)) {
    if (!got.has(value)) errors.push(`${label} missing ${value}`);
  }
  for (const value of uniqueSorted(actual)) {
    if (!want.has(value)) errors.push(`${label} extra ${value}`);
  }
  return errors;
}

/**
 * First fenced-backtick list after a ### heading (the contract inventory line).
 * @param {string} markdown
 * @param {string} headingPrefix
 * @returns {string[]}
 */
export function extractDocTypeList(markdown, headingPrefix) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.startsWith(headingPrefix));
  if (headingIndex < 0) return [];
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('### ')) break;
    if (!line.includes('`')) continue;
    const tokens = [];
    const re = /`([a-z][a-z0-9_.]+)`/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      tokens.push(match[1]);
    }
    if (tokens.length > 0) return tokens;
  }
  return [];
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function extractExecutorCommandTypes(source) {
  const found = [];
  const re = /command\.type === ['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    found.push(match[1]);
  }
  return uniqueSorted(found);
}

/**
 * @param {string} source
 * @returns {boolean}
 */
export function cjsLoadsCanonicalJson(source) {
  return source.includes("require('../../shared/remote-many/protocol.json')");
}

/**
 * @param {string[]} values
 */
function asConstArray(values) {
  return values.map((value) => `  '${value}',`).join('\n');
}

/**
 * @param {ProtocolSpec} spec
 */
export function buildTypeScript(spec) {
  return `/**
 * GENERATED — do not edit.
 * Canonical source: shared/remote-many/protocol.json
 * Regenerar: pnpm run generate:remote-protocol
 */
export const REMOTE_PROTOCOL_NAME = ${JSON.stringify(spec.name)} as const;
export const REMOTE_PROTOCOL_VERSION = ${spec.version} as const;
export const REMOTE_HKDF_INFO = ${JSON.stringify(spec.hkdfInfo)} as const;
export const REMOTE_MAX_ENVELOPE_BYTES = ${spec.maxEnvelopeBytes} as const;
export const REMOTE_COMMAND_TTL_MS = ${spec.commandTtlMs} as const;
export const REMOTE_EVENT_TTL_MS = ${spec.eventTtlMs} as const;
export const REMOTE_HEARTBEAT_MS = ${spec.heartbeatMs} as const;
export const REMOTE_ONLINE_WINDOW_MS = ${spec.onlineWindowMs} as const;
export const REMOTE_PAIRING_TTL_MS = ${spec.pairingTtlMs} as const;

export const REMOTE_AGENT_MODES = [
${asConstArray(spec.agentModes)}
] as const;

export const REMOTE_COMMAND_TYPES = [
${asConstArray(spec.commandTypes)}
] as const;

export const REMOTE_EVENT_TYPES = [
${asConstArray(spec.eventTypes)}
] as const;

export type ManyAgentMode = (typeof REMOTE_AGENT_MODES)[number];
export type RemoteCommandType = (typeof REMOTE_COMMAND_TYPES)[number];
export type RemoteEventType = (typeof REMOTE_EVENT_TYPES)[number];

const COMMAND_TYPE_SET: ReadonlySet<string> = new Set(REMOTE_COMMAND_TYPES);
const EVENT_TYPE_SET: ReadonlySet<string> = new Set(REMOTE_EVENT_TYPES);
const AGENT_MODE_SET: ReadonlySet<string> = new Set(REMOTE_AGENT_MODES);

export interface RemoteEnvelope {
  v: number;
  kid: string;
  nonce: string;
  ciphertext: string;
}

export function isRemoteAgentMode(value: string): value is ManyAgentMode {
  return AGENT_MODE_SET.has(value);
}

export function isRemoteCommandType(value: string): value is RemoteCommandType {
  return COMMAND_TYPE_SET.has(value);
}

export function isRemoteEventType(value: string): value is RemoteEventType {
  return EVENT_TYPE_SET.has(value);
}

export function isRemoteEnvelope(value: unknown): value is RemoteEnvelope {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.v === REMOTE_PROTOCOL_VERSION &&
    typeof row.kid === 'string' &&
    row.kid.length > 0 &&
    typeof row.nonce === 'string' &&
    row.nonce.length > 0 &&
    typeof row.ciphertext === 'string' &&
    row.ciphertext.length > 0
  );
}

export function envelopeByteLength(envelope: RemoteEnvelope): number {
  try {
    return new TextEncoder().encode(JSON.stringify(envelope)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
`;
}

/**
 * @param {ProtocolSpec} spec
 * @param {{ protocol?: Record<string, unknown>, docs?: string, executor?: string, cjsSource?: string, generatedTs?: string, committedTs?: string }} [inputs]
 */
export function collectDriftErrors(spec, inputs = {}) {
  /** @type {string[]} */
  const errors = [];
  const protocol = inputs.protocol;
  if (protocol) {
    errors.push(...diffLists(spec.commandTypes, /** @type {string[]} */ (protocol.COMMAND_TYPES), 'protocol.cjs commandTypes'));
    errors.push(...diffLists(spec.eventTypes, /** @type {string[]} */ (protocol.EVENT_TYPES), 'protocol.cjs eventTypes'));
    errors.push(...diffLists(spec.agentModes, /** @type {string[]} */ (protocol.AGENT_MODES), 'protocol.cjs agentModes'));
    if (protocol.PROTOCOL_NAME !== spec.name) {
      errors.push(`protocol.cjs PROTOCOL_NAME is ${String(protocol.PROTOCOL_NAME)}`);
    }
    if (protocol.PROTOCOL_VERSION !== spec.version) {
      errors.push(`protocol.cjs PROTOCOL_VERSION is ${String(protocol.PROTOCOL_VERSION)}`);
    }
    if (protocol.HKDF_INFO !== spec.hkdfInfo) {
      errors.push(`protocol.cjs HKDF_INFO is ${String(protocol.HKDF_INFO)}`);
    }
    if (protocol.MAX_ENVELOPE_BYTES !== spec.maxEnvelopeBytes) {
      errors.push(`protocol.cjs MAX_ENVELOPE_BYTES is ${String(protocol.MAX_ENVELOPE_BYTES)}`);
    }
  }
  if (typeof inputs.cjsSource === 'string' && !cjsLoadsCanonicalJson(inputs.cjsSource)) {
    errors.push(`${CJS_REL} must require ${SPEC_REL}`);
  }
  if (typeof inputs.docs === 'string') {
    const commands = extractDocTypeList(inputs.docs, '### Comandos');
    const events = extractDocTypeList(inputs.docs, '### Eventos');
    errors.push(...diffLists(spec.commandTypes, commands, 'docs commandTypes'));
    errors.push(...diffLists(spec.eventTypes, events, 'docs eventTypes'));
  }
  if (typeof inputs.executor === 'string') {
    const handled = extractExecutorCommandTypes(inputs.executor);
    errors.push(...diffLists(spec.commandTypes, handled, 'executor commandTypes'));
  }
  if (typeof inputs.generatedTs === 'string' && typeof inputs.committedTs === 'string') {
    if (inputs.generatedTs !== inputs.committedTs) {
      errors.push(`${TS_REL} desincronizado. Ejecuta: pnpm run generate:remote-protocol`);
    }
  }
  return errors;
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

export function runGenerate() {
  const spec = loadSpec();
  const ts = buildTypeScript(spec);
  fs.mkdirSync(path.dirname(TS_PATH), { recursive: true });
  fs.writeFileSync(TS_PATH, ts);
  return { spec, ts, path: TS_PATH };
}

export function runCheck() {
  const spec = loadSpec();
  const protocol = require(CJS_PATH);
  const generatedTs = buildTypeScript(spec);
  const committedTs = readIfExists(TS_PATH);
  const errors = collectDriftErrors(spec, {
    protocol,
    cjsSource: readIfExists(CJS_PATH),
    docs: readIfExists(DOCS_PATH),
    executor: readIfExists(EXECUTOR_PATH),
    generatedTs,
    committedTs,
  });
  return { spec, errors };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const check = process.argv.includes('--check');
  if (check) {
    const { spec, errors } = runCheck();
    if (errors.length > 0) {
      console.error('Remote Many protocol drift:');
      for (const error of errors) console.error(`- ${error}`);
      process.exit(1);
    }
    console.log(
      `remote-many protocol OK · v${spec.version} · ${spec.commandTypes.length} commands · ${spec.eventTypes.length} events`,
    );
    process.exit(0);
  }
  const { path: outPath, spec } = runGenerate();
  console.log(`Wrote ${path.relative(ROOT, outPath)} (${spec.commandTypes.length} commands, ${spec.eventTypes.length} events)`);
}
