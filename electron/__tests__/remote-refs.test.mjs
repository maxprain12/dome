import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { looksOpaque, publicLabel, normalizePins, normalizeSkills, normalizeMcp } = require('../remote/refs.cjs');
const { parseResourceHref, resourceKind } = require('../remote/preview.cjs');
const {
  isViewable,
  safeFilename,
  extensionFor,
  chunkCountFor,
  buildFileChunk,
  CHUNK_BYTES,
} = require('../remote/export.cjs');
const { prependSystemOverlay } = require('../remote/skill-overlay.cjs');
const { isCommandType, MAX_ENVELOPE_BYTES, envelopeByteLength } = require('../remote/protocol.cjs');

describe('remote-many refs', () => {
  it('never uses opaque ids as labels', () => {
    assert.equal(looksOpaque('sp-deadbeef'), true);
    assert.equal(looksOpaque('Study plan'), false);
    assert.equal(publicLabel('sp-aaaaaa111111', ''), '');
    assert.equal(publicLabel('Notas de física', 'Recurso'), 'Notas de física');
  });

  it('keeps human pin titles and drops empty rows', () => {
    const pins = normalizePins([
      { id: 'res-1', title: 'Syllabus', type: 'pdf' },
      { id: 'res-2', title: 'sp-deadbeef' },
      { id: '', title: 'Vacío' },
    ]);
    assert.deepEqual(pins, [{ id: 'res-1', title: 'Syllabus', type: 'pdf', kind: 'resource' }]);
  });

  it('normalizes skill names without dumping ids into the prompt', () => {
    const skills = normalizeSkills([{ id: 'folder-id', name: 'Literature review' }, { title: '  ' }]);
    assert.deepEqual(skills, [{ id: 'folder-id', name: 'Literature review' }]);
  });

  it('keeps human MCP names and drops opaque rows', () => {
    assert.deepEqual(normalizeMcp(['Calendar', { id: 'uuid', name: 'sp-deadbeef' }]), ['Calendar']);
  });

  it('parses resource hrefs without exposing them as labels', () => {
    assert.equal(parseResourceHref('dome://resource/abc-123/ppt'), 'abc-123');
    assert.equal(parseResourceHref('/resource/abc-123'), 'abc-123');
    assert.equal(resourceKind('ppt'), 'ppt');
    assert.equal(resourceKind('excel'), 'excel');
    assert.equal(isCommandType('refs.preview'), true);
    assert.equal(isCommandType('refs.export'), true);
  });

  it('sends only viewable files with a human filename', () => {
    assert.equal(isViewable('ppt', 'pptx'), true);
    assert.equal(isViewable('pdf', 'pdf'), true);
    assert.equal(isViewable('folder', ''), false);
    assert.equal(extensionFor('ppt', '', 'informe.pptx'), 'pptx');
    assert.equal(safeFilename('Informe ADVO', 'pptx'), 'Informe ADVO.pptx');
    assert.equal(safeFilename('sp-deadbeef', 'pdf'), 'Documento.pdf');
    assert.equal(safeFilename('../etc/passwd', 'md'), '..-etc-passwd.md');
    assert.equal(chunkCountFor(0), 1);
    assert.equal(chunkCountFor(CHUNK_BYTES + 1), 2);
    const chunk = buildFileChunk({
      buffer: Buffer.from('hello'),
      offset: 0,
      name: 'Notas.md',
      mime: 'text/markdown',
      kind: 'note',
    });
    assert.equal(chunk.viewable, true);
    assert.equal(chunk.chunkCount, 1);
    assert.equal(Buffer.from(chunk.data, 'base64').toString('utf8'), 'hello');
    assert.equal(buildFileChunk({
      buffer: Buffer.from('x'),
      offset: 0,
      name: 'clave.pem',
      mime: 'application/octet-stream',
      kind: 'resource',
    }).error, 'not_viewable');
  });

  it('keeps a max-size file chunk under the relay envelope cap', () => {
    const { encryptEnvelope, generateKeyPair, deriveSharedKey } = require('../remote/crypto.cjs');
    const buffer = Buffer.alloc(CHUNK_BYTES, 7);
    const chunk = buildFileChunk({
      buffer,
      offset: 0,
      name: 'Informe de Redes Sociales — ADVO.pptx',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      kind: 'ppt',
    });
    const keys = generateKeyPair();
    const peer = generateKeyPair();
    const pairingId = '11111111-2222-4333-8444-555555555555';
    const aes = deriveSharedKey(keys.privateKey, peer.publicKey, pairingId);
    const envelope = encryptEnvelope(aes, pairingId, {
      id: 'evt_test',
      type: 'refs',
      payload: { file: chunk },
      createdAt: Date.now(),
    });
    assert.ok(envelopeByteLength(envelope) <= MAX_ENVELOPE_BYTES);
  });

  it('prepends skill overlay as a system message', () => {
    const next = prependSystemOverlay([{ role: 'user', content: 'hola' }], '## Skills\n### pptx');
    assert.equal(next[0].role, 'system');
    assert.match(next[0].content, /Skills/);
    assert.equal(next[1].content, 'hola');
  });

  it('formats ppt slides with titles instead of a concatenated dump', () => {
    const { formatPptSlides } = require('../remote/preview.cjs');
    const slides = formatPptSlides([
      { title: 'Portada', text: 'Informe de Redes Sociales\nÚltimos 30 días' },
      { text: 'Resumen ejecutivo\n2.030 impresiones · 146 likes' },
      { text: 'AV Informe de Redes Sociales Resumen de actividad métricas y rendimiento Período últimos 30 días' },
    ]);
    assert.equal(slides[0].title, 'Portada');
    assert.match(slides[0].excerpt, /30 días/);
    assert.equal(slides[1].title, 'Resumen ejecutivo');
    assert.match(slides[1].excerpt, /impresiones/);
    assert.equal(slides[2].title, 'Diapositiva 3');
    assert.equal(slides[0].index, 1);
  });
});
