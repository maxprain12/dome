/**
 * Tests for the Remote Many protocol drift checker.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cjsLoadsCanonicalJson,
  collectDriftErrors,
  diffLists,
  extractDocTypeList,
  extractExecutorCommandTypes,
} from '../generate-remote-protocol.mjs';

const SPEC = {
  name: 'remote-many',
  version: 1,
  hkdfInfo: 'dome-remote-many-v1',
  maxEnvelopeBytes: 65536,
  commandTtlMs: 1,
  eventTtlMs: 1,
  heartbeatMs: 1,
  onlineWindowMs: 1,
  pairingTtlMs: 1,
  agentModes: ['plan', 'draft', 'agent'],
  commandTypes: ['refs.list', 'mode.set'],
  eventTypes: ['plan', 'visual', 'refs'],
};

describe('diffLists', () => {
  it('reports missing and extra values', () => {
    const errors = diffLists(['a', 'b'], ['b', 'c'], 'sample');
    assert.deepEqual(errors, ['sample missing a', 'sample extra c']);
  });
});

describe('extractDocTypeList', () => {
  it('reads the inventory line under Comandos / Eventos', () => {
    const md = `# Remote Many

### Comandos (Companion → Desktop)

\`session.start\` · \`refs.list\` · \`mode.set\`

More prose with \`not-a-type-list\`.

### Eventos (Desktop → Companion)

\`plan\` · \`visual\` · \`refs\`
`;
    assert.deepEqual(extractDocTypeList(md, '### Comandos'), [
      'session.start',
      'refs.list',
      'mode.set',
    ]);
    assert.deepEqual(extractDocTypeList(md, '### Eventos'), ['plan', 'visual', 'refs']);
  });
});

describe('extractExecutorCommandTypes', () => {
  it('collects command.type branches', () => {
    const source = `
    if (command.type === 'refs.list') {}
    if (command.type === 'mode.set') {}
    if (command.type === 'refs.list') {}
    `;
    assert.deepEqual(extractExecutorCommandTypes(source), ['mode.set', 'refs.list']);
  });
});

describe('cjsLoadsCanonicalJson', () => {
  it('requires the shared protocol.json', () => {
    assert.equal(
      cjsLoadsCanonicalJson("const spec = require('../../shared/remote-many/protocol.json');\n"),
      true,
    );
    assert.equal(cjsLoadsCanonicalJson("const COMMAND_TYPES = ['session.start'];\n"), false);
  });
});

describe('collectDriftErrors', () => {
  it('fails when Provider-style stale copies omit refs/mode/plan/visual', () => {
    const errors = collectDriftErrors(SPEC, {
      protocol: {
        PROTOCOL_NAME: 'remote-many',
        PROTOCOL_VERSION: 1,
        HKDF_INFO: 'dome-remote-many-v1',
        MAX_ENVELOPE_BYTES: 65536,
        COMMAND_TYPES: ['session.start'],
        EVENT_TYPES: ['start', 'text'],
        AGENT_MODES: ['agent'],
      },
      cjsSource: "const COMMAND_TYPES = ['session.start'];\n",
      docs: '### Comandos\n\n`session.start`\n\n### Eventos\n\n`start` · `text`\n',
      executor: "if (command.type === 'session.start') {}\n",
      generatedTs: 'generated',
      committedTs: 'stale',
    });
    assert.ok(errors.some((line) => line.includes('refs.list')));
    assert.ok(errors.some((line) => line.includes('mode.set')));
    assert.ok(errors.some((line) => line.includes('plan')));
    assert.ok(errors.some((line) => line.includes('visual')));
    assert.ok(errors.some((line) => line.includes('protocol.json')));
    assert.ok(errors.some((line) => line.includes('desincronizado')));
  });

  it('passes when CJS, docs, executor and generated TS match the spec', () => {
    const generated = 'export const REMOTE_COMMAND_TYPES = [];\n';
    const errors = collectDriftErrors(SPEC, {
      protocol: {
        PROTOCOL_NAME: 'remote-many',
        PROTOCOL_VERSION: 1,
        HKDF_INFO: 'dome-remote-many-v1',
        MAX_ENVELOPE_BYTES: 65536,
        COMMAND_TYPES: SPEC.commandTypes,
        EVENT_TYPES: SPEC.eventTypes,
        AGENT_MODES: SPEC.agentModes,
      },
      cjsSource: "const spec = require('../../shared/remote-many/protocol.json');\n",
      docs: '### Comandos\n\n`refs.list` · `mode.set`\n\n### Eventos\n\n`plan` · `visual` · `refs`\n',
      executor: "if (command.type === 'refs.list') {}\nif (command.type === 'mode.set') {}\n",
      generatedTs: generated,
      committedTs: generated,
    });
    assert.deepEqual(errors, []);
  });
});
