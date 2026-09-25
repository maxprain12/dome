import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  buildSessionUpdate,
  createTranscriptAssembler,
  createRealtimeTranscriber,
} = require('../transcription/stt/realtime-stt.cjs');
const { applyAlternatingSpeakerHeuristic, fromDiarizedSegments } = require('../transcription/stt/structured.cjs');
const { toErrorCode, TranscriptionError } = require('../transcription/errors.cjs');

class FakeSocket {
  static last = null;
  constructor(url, init) {
    this.url = url;
    this.init = init;
    this.sent = [];
    this.listeners = {};
    FakeSocket.last = this;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  emit(type, event = {}) {
    for (const fn of this.listeners[type] || []) fn(event);
  }
  server(msg) {
    this.emit('message', { data: JSON.stringify(msg) });
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
}

function transcriber() {
  const texts = [];
  const errors = [];
  const handle = createRealtimeTranscriber({
    apiKey: 'sk-test',
    model: 'gpt-4o-mini-transcribe',
    language: 'es',
    onText: (t) => texts.push(t),
    onError: (code, detail) => errors.push({ code, detail }),
    WebSocketImpl: FakeSocket,
  });
  return { handle, ws: FakeSocket.last, texts, errors };
}

test('session.update configures a transcription session with PCM 24 kHz and server VAD', () => {
  const msg = buildSessionUpdate({ model: 'gpt-4o-transcribe', language: 'es', prompt: null });
  assert.equal(msg.type, 'session.update');
  assert.equal(msg.session.type, 'transcription');
  assert.deepEqual(msg.session.audio.input.format, { type: 'audio/pcm', rate: 24000 });
  assert.deepEqual(msg.session.audio.input.transcription, { model: 'gpt-4o-transcribe', language: 'es' });
  assert.equal(msg.session.audio.input.turn_detection.type, 'server_vad');
});

test('assembler orders turns by previous_item_id even when completions arrive out of order', () => {
  const a = createTranscriptAssembler();
  a.commit('i1', null);
  a.commit('i2', 'i1');
  a.complete('i2', 'segundo');
  a.delta('i1', 'pri');
  assert.equal(a.text(), 'pri segundo');
  a.complete('i1', 'primero');
  assert.equal(a.text(), 'primero segundo');
  assert.equal(a.pendingCount(), 0);
});

test('audio queued before open is flushed after the session update, with the bearer header', () => {
  const { handle, ws } = transcriber();
  assert.equal(ws.init.headers.Authorization, 'Bearer sk-test');
  handle.appendPcm(new Uint8Array([1, 2, 3, 4]).buffer);
  assert.equal(ws.sent.length, 0);
  ws.emit('open');
  assert.equal(ws.sent[0].type, 'session.update');
  assert.equal(ws.sent[1].type, 'input_audio_buffer.append');
  assert.equal(ws.sent[1].audio, Buffer.from([1, 2, 3, 4]).toString('base64'));
});

test('deltas and completions surface as the running transcript', () => {
  const { ws, texts } = transcriber();
  ws.emit('open');
  ws.server({ type: 'input_audio_buffer.committed', item_id: 'a', previous_item_id: null });
  ws.server({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'Hola ' });
  ws.server({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'mundo' });
  ws.server({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'Hola mundo.' });
  assert.deepEqual(texts, ['Hola', 'Hola mundo', 'Hola mundo.']);
});

test('unexpected close reports realtime_connection_failed once; closing on purpose does not', async () => {
  const first = transcriber();
  first.ws.emit('open');
  first.ws.emit('close', { code: 1006 });
  first.ws.emit('error');
  assert.deepEqual(first.errors.map((e) => e.code), ['realtime_connection_failed']);

  const second = transcriber();
  second.ws.emit('open');
  const closing = second.handle.close();
  assert.equal(second.ws.sent.at(-1).type, 'input_audio_buffer.commit');
  second.ws.server({ type: 'error', error: { code: 'input_audio_buffer_commit_empty' } });
  await closing;
  assert.equal(second.ws.closed, true);
  assert.deepEqual(second.errors, []);
});

test('heuristic speakers carry an ordinal and no hardcoded label', () => {
  const raw = [
    { start: 0, end: 1, text: 'hola' },
    { start: 4, end: 5, text: 'qué tal' },
  ];
  const { speakers, segments } = applyAlternatingSpeakerHeuristic(raw, { speakerMode: 'alternating', maxSpeakers: 2 });
  assert.deepEqual(speakers, { 'auto-0': { label: '', ordinal: 0 }, 'auto-1': { label: '', ordinal: 1 } });
  assert.deepEqual(segments.map((s) => s.speakerId), ['auto-0', 'auto-1']);

  const diarized = fromDiarizedSegments([{ start: 0, end: 1, text: 'x', speaker: 'B' }, { start: 1, end: 2, text: 'y', speaker: 'A' }]);
  assert.deepEqual(diarized.speakers, { A: { label: '', ordinal: 0 }, B: { label: '', ordinal: 1 } });
});

test('error codes survive; unknown errors fall back', () => {
  assert.equal(toErrorCode(new TranscriptionError('missing_groq_key')), 'missing_groq_key');
  assert.equal(toErrorCode(new Error('session_not_found')), 'session_not_found');
  assert.equal(toErrorCode(new Error('ECONNRESET')), 'transcription_failed');
});
