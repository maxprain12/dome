'use strict';

/**
 * Live transcription over the OpenAI Realtime API (transcription session).
 *
 * The socket lives in the main process so the API key never reaches the
 * renderer. Audio arrives as PCM16 mono 24 kHz from the capture AudioWorklet;
 * server VAD commits turns and the API streams `delta` then `completed` text
 * per item. Items are ordered by `input_audio_buffer.committed.previous_item_id`
 * because completion events of different turns may arrive out of order.
 */

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';
const SAMPLE_RATE = 24000;
/** Cap queued audio while connecting (~20 s of PCM16 @ 24 kHz). */
const MAX_PENDING_BYTES = SAMPLE_RATE * 2 * 20;
const CLOSE_DRAIN_MS = 4000;

function buildSessionUpdate({ model, language, prompt }) {
  const transcription = { model };
  if (language) transcription.language = language;
  if (prompt) transcription.prompt = prompt;
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: SAMPLE_RATE },
          transcription,
          turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
        },
      },
    },
  };
}

/** Ordered transcript assembled from committed items and their streamed text. */
function createTranscriptAssembler() {
  const order = [];
  const texts = new Map();
  const done = new Set();

  function place(itemId, previousItemId) {
    if (order.includes(itemId)) return;
    const at = previousItemId ? order.indexOf(previousItemId) : -1;
    if (at >= 0) order.splice(at + 1, 0, itemId);
    else order.push(itemId);
  }

  return {
    commit(itemId, previousItemId) {
      if (itemId) place(itemId, previousItemId);
    },
    delta(itemId, text) {
      if (!itemId || !text) return;
      place(itemId, null);
      texts.set(itemId, (texts.get(itemId) || '') + text);
    },
    complete(itemId, transcript) {
      if (!itemId) return;
      place(itemId, null);
      texts.set(itemId, String(transcript || ''));
      done.add(itemId);
    },
    pendingCount() {
      return order.filter((id) => !done.has(id)).length;
    },
    text() {
      return order
        .map((id) => (texts.get(id) || '').trim())
        .filter(Boolean)
        .join(' ');
    },
  };
}

/**
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   language?: string|null,
 *   prompt?: string|null,
 *   onText: (fullText: string) => void,
 *   onError: (code: string, detail?: string) => void,
 *   WebSocketImpl?: typeof WebSocket,
 *   url?: string,
 * }} opts
 */
function createRealtimeTranscriber(opts) {
  const WebSocketImpl = opts.WebSocketImpl || globalThis.WebSocket;
  const transcript = createTranscriptAssembler();
  let pending = [];
  let pendingBytes = 0;
  let open = false;
  let closing = false;
  let failed = false;
  let drainResolve = null;

  const ws = new WebSocketImpl(opts.url || REALTIME_URL, {
    headers: { Authorization: `Bearer ${opts.apiKey}` },
  });

  function send(payload) {
    ws.send(JSON.stringify(payload));
  }

  function fail(detail) {
    if (failed || closing) return;
    failed = true;
    opts.onError('realtime_connection_failed', detail);
  }

  function emit() {
    opts.onText(transcript.text());
    if (drainResolve && transcript.pendingCount() === 0) drainResolve();
  }

  ws.addEventListener('open', () => {
    open = true;
    send(buildSessionUpdate(opts));
    for (const chunk of pending) send({ type: 'input_audio_buffer.append', audio: chunk });
    pending = [];
    pendingBytes = 0;
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
    } catch {
      return;
    }
    switch (msg.type) {
      case 'input_audio_buffer.committed':
        transcript.commit(msg.item_id, msg.previous_item_id);
        break;
      case 'conversation.item.input_audio_transcription.delta':
        transcript.delta(msg.item_id, msg.delta);
        emit();
        break;
      case 'conversation.item.input_audio_transcription.completed':
        transcript.complete(msg.item_id, msg.transcript);
        emit();
        break;
      case 'error':
        // Committing an empty buffer on stop is expected: nothing left to drain.
        if (closing) {
          if (transcript.pendingCount() === 0) drainResolve?.();
          break;
        }
        fail(msg.error?.message || msg.error?.code || 'realtime_error');
        break;
      default:
        break;
    }
  });

  ws.addEventListener('error', () => fail('socket_error'));
  ws.addEventListener('close', (event) => {
    open = false;
    drainResolve?.();
    if (!closing) fail(`closed_${event?.code ?? 'unknown'}`);
  });

  /** @param {ArrayBuffer|Buffer|Uint8Array} pcm16 */
  function appendPcm(pcm16) {
    if (failed || closing) return;
    const audio = Buffer.from(pcm16 instanceof ArrayBuffer ? new Uint8Array(pcm16) : pcm16).toString('base64');
    if (open) {
      send({ type: 'input_audio_buffer.append', audio });
      return;
    }
    pendingBytes += audio.length;
    pending.push(audio);
    while (pendingBytes > MAX_PENDING_BYTES && pending.length > 1) pendingBytes -= pending.shift().length;
  }

  /** Flush the last turn, wait briefly for its text, then close. Resolves with the full transcript. */
  async function close() {
    if (closing) return transcript.text();
    closing = true;
    if (open && !failed) {
      try {
        send({ type: 'input_audio_buffer.commit' });
      } catch {
        /* socket already gone */
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, CLOSE_DRAIN_MS);
        drainResolve = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    return transcript.text();
  }

  return { appendPcm, close, getText: () => transcript.text(), isFailed: () => failed };
}

module.exports = {
  REALTIME_URL,
  SAMPLE_RATE,
  buildSessionUpdate,
  createTranscriptAssembler,
  createRealtimeTranscriber,
};
