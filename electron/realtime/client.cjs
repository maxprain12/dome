'use strict';

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const { fetchWithDomeAuth } = require('../auth/dome-oauth.cjs');
const { fullJitterBackoffMs } = require('../net/backoff.cjs');

const REALTIME_URL = 'https://rt.dowi.es/connection/uni_sse';
const SETTING_KEY = 'realtime_gateway_enabled';

function isEnabled(database) {
  try {
    const row = database.getSetting?.(SETTING_KEY);
    return row === 'true' || row === true;
  } catch {
    return false;
  }
}

async function fetchToken(database, deviceId) {
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const res = await fetchWithDomeAuth(database, `${base}/api/v1/realtime/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) throw new Error(`realtime_token_${res.status}`);
  const data = await res.json();
  if (!data?.token) throw new Error('realtime_token_missing');
  return data.token;
}

function start({ database, deviceId, onSyncHint, onRemoteHint }) {
  if (!isEnabled(database)) return () => {};
  let stopped = false;
  let failures = 0;
  const abort = new AbortController();

  const loop = async () => {
    let attempt = 0;
    while (!stopped && failures < 3) {
      try {
        const token = await fetchToken(database, deviceId);
        const res = await fetch(REALTIME_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`realtime_sse_${res.status}`);
        failures = 0;
        attempt = 0;
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
            if (!dataLine) continue;
            try {
              const event = JSON.parse(dataLine.slice(5).trim());
              const channel = String(event.channel || '');
              if (channel.startsWith('sync:') && event.data?.domain) onSyncHint?.(event.data.domain);
              if (channel.startsWith('remote:')) onRemoteHint?.();
            } catch {
              /* ignore malformed frames */
            }
          }
        }
      } catch (err) {
        if (stopped || abort.signal.aborted) return;
        failures += 1;
        attempt += 1;
        console.warn('[realtime] reconnect', err?.message || err);
        await new Promise((resolve) => setTimeout(resolve, fullJitterBackoffMs(attempt, { baseMs: 500, maxMs: 30_000 })));
      }
    }
  };

  void loop();
  return () => {
    stopped = true;
    abort.abort();
  };
}

module.exports = { start, isEnabled };
