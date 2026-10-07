#!/usr/bin/env node
/**
 * Remote Many protocol drift check (dome side).
 *
 * The wire contract lives in the manys-kit package `@maxprain12/remote-many`
 * (`protocol.json`, generated TypeScript types). This script only guards the
 * Dome code that has to follow it:
 *   - electron/remote/protocol.cjs loads the package JSON (no hand-copied lists)
 *   - electron/remote/executor.cjs handles every command type
 *   - docs/architecture/remote-many.md lists the same commands and events
 *
 *   pnpm run check:remote-protocol
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const SPEC_MODULE = '@maxprain12/remote-many/protocol.json';
export const CJS_REL = 'electron/remote/protocol.cjs';
export const EXECUTOR_REL = 'electron/remote/executor.cjs';
export const DOCS_REL = 'docs/architecture/remote-many.md';

const CJS_PATH = path.join(ROOT, CJS_REL);
const EXECUTOR_PATH = path.join(ROOT, EXECUTOR_REL);
const DOCS_PATH = path.join(ROOT, DOCS_REL);

/** @typedef {{ name: string, version: number, hkdfInfo: string, maxEnvelopeBytes: number, commandTtlMs: number, eventTtlMs: number, heartbeatMs: number, onlineWindowMs: number, pairingTtlMs: number, agentModes: string[], commandTypes: string[], eventTypes: string[] }} ProtocolSpec */

/**
 * @returns {ProtocolSpec}
 */
export function loadSpec() {
  const spec = require(SPEC_MODULE);
  assertSpec(spec, SPEC_MODULE);
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
  return source.includes(`require('${SPEC_MODULE}')`);
}

/**
 * @param {ProtocolSpec} spec
 * @param {{ protocol?: Record<string, unknown>, docs?: string, executor?: string, cjsSource?: string }} [inputs]
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
    errors.push(`${CJS_REL} must require ${SPEC_MODULE}`);
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
  return errors;
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

export function runCheck() {
  const spec = loadSpec();
  const protocol = require(CJS_PATH);
  const errors = collectDriftErrors(spec, {
    protocol,
    cjsSource: readIfExists(CJS_PATH),
    docs: readIfExists(DOCS_PATH),
    executor: readIfExists(EXECUTOR_PATH),
  });
  return { spec, errors };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { spec, errors } = runCheck();
  if (errors.length > 0) {
    console.error('Remote Many protocol drift:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `remote-many protocol OK · v${spec.version} · ${spec.commandTypes.length} commands · ${spec.eventTypes.length} events`,
  );
}
