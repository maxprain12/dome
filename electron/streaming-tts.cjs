/* eslint-disable no-console */
/**
 * Streaming TTS Orchestrator
 *
 * Receives text chunks as the AI streams its response, splits them into
 * sentences, generates TTS per-sentence (in parallel), and plays them
 * sequentially so the user hears the response in near-real-time.
 *
 * Pipeline:
 *   chunk → accumulate → split sentence → generate TTS (parallel) → play (sequential)
 *
 * Sentence N+1's TTS is generated while sentence N is playing, so the
 * first sentence starts playing within ~1-2 s and subsequent sentences
 * start almost instantly after the previous one ends.
 */

const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');

// ─── Voice mapping by language ───────────────────────────────────────────────
// OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
const VOICE_FOR_LANGUAGE = {
  en: 'nova',
  es: 'nova',
  fr: 'shimmer',
  pt: 'nova',
};
const DEFAULT_VOICE = 'nova';

/**
 * Strip markdown and noise for TTS input (applied per-sentence).
 * @param {string} text
 * @returns {string}
 */
function stripForTts(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
    .replace(/\*\*?|__/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

class StreamingTtsOrchestrator {
  constructor() {
    /** @type {Map<string, SessionState>} */
    this._sessions = new Map();

    // Injected via init()
    this._broadcastFn = null;
    this._getApiKeyFn = null;
    this._generateSpeechFn = null;
  }

  /**
   * Initialize with dependencies from the main process.
   *
   * @param {Object} opts
   * @param {function(string, any): void} opts.broadcast  Broadcasts event to all windows
   * @param {function(): string|null} opts.getApiKey      Returns OpenAI API key
   * @param {function(string, string, string, Object): Promise<{success:boolean,audioPath?:string,error?:string}>} opts.generateSpeech
   */
  init({ broadcast, getApiKey, generateSpeech }) {
    this._broadcastFn = broadcast;
    this._getApiKeyFn = getApiKey;
    this._generateSpeechFn = generateSpeech;
  }

  // ─── Public lifecycle ───────────────────────────────────────────────────────

  /**
   * Start a streaming TTS session for a run.
   * @param {string} runId
   * @param {{ language?: string }} opts
   */
  start(runId, { language = 'es' } = {}) {
    if (this._sessions.has(runId)) return;

    const voice = VOICE_FOR_LANGUAGE[language] || DEFAULT_VOICE;

    /** @type {SessionState} */
    const session = {
      runId,
      voice,
      language,
      buffer: '',
      pendingSentences: 0,
      playbackChain: Promise.resolve(),
      flushed: false,
      cancelled: false,
      activeProcess: null,
    };

    this._sessions.set(runId, session);
    console.log(`[StreamingTTS] Session started: runId=${runId} voice=${voice} lang=${language}`);
  }

  /**
   * Feed a text chunk from the streaming AI response.
   * @param {string} runId
   * @param {string} text
   */
  feedChunk(runId, text) {
    const session = this._sessions.get(runId);
    if (!session || session.cancelled) return;

    session.buffer += text;
    this._extractSentences(session);
  }

  /**
   * Flush any remaining buffered text and mark the session complete.
   * @param {string} runId
   */
  flush(runId) {
    const session = this._sessions.get(runId);
    if (!session || session.cancelled) return;

    const remaining = stripForTts(session.buffer.trim());
    if (remaining.length >= 5) {
      this._scheduleSentence(session, remaining);
    }
    session.buffer = '';
    session.flushed = true;

    // No sentences were ever scheduled → finish immediately
    if (session.pendingSentences === 0) {
      this._finishSession(session);
    }
  }

  /**
   * Cancel a session — kills active playback and clears state.
   * @param {string} runId
   */
  cancel(runId) {
    const session = this._sessions.get(runId);
    if (!session) return;

    session.cancelled = true;

    if (session.activeProcess) {
      try { session.activeProcess.kill('SIGTERM'); } catch { /* ignore */ }
      session.activeProcess = null;
    }

    this._sessions.delete(runId);
    console.log(`[StreamingTTS] Session cancelled: runId=${runId}`);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Extract complete sentences from the buffer and schedule them. */
  _extractSentences(session) {
    // Match sentence-ending punctuation (. ! ? …) followed by whitespace + capital letter.
    // The look-behind captures the punctuation; the match itself is the whitespace gap.
    // Using a simple regex that doesn't need lookbehind to stay compatible.
    const RE = /([.!?…])\s+(?=[A-Z\u00C0-\u024F"])/g;
    const MIN_LENGTH = 15; // chars after stripping

    let text = session.buffer;
    let lastCut = 0;
    let match;

    RE.lastIndex = 0;
    while ((match = RE.exec(text)) !== null) {
      // include the terminal punctuation character
      const end = match.index + 1;
      const raw = text.slice(lastCut, end).trim();
      const stripped = stripForTts(raw);

      if (stripped.length >= MIN_LENGTH) {
        this._scheduleSentence(session, stripped);
        lastCut = match.index + match[0].length;
        RE.lastIndex = lastCut;
      }
    }

    session.buffer = text.slice(lastCut);
  }

  /**
   * Schedule a single sentence for TTS generation + sequential playback.
   * Generation runs immediately (in parallel); playback waits on the chain.
   */
  _scheduleSentence(session, text) {
    if (!text || session.cancelled) return;

    session.pendingSentences++;

    // Start TTS generation NOW (in parallel with previous sentences)
    const genPromise = this._generateTts(session.voice, text);

    // Playback is serialized via promise chain
    session.playbackChain = session.playbackChain
      .then(async () => {
        if (session.cancelled) return;

        try {
          const result = await genPromise;
          if (session.cancelled) return;

          if (!result.success || !result.audioPath) {
            console.warn(`[StreamingTTS] TTS failed: ${result.error}`);
            this._emit('tts:error', { runId: session.runId, error: result.error });
            return;
          }

          // Notify renderers which sentence is now playing (for live transcript)
          this._emit('tts:sentence-playing', { runId: session.runId, sentence: text });

          await this._playAudio(session, result.audioPath);
        } catch (err) {
          if (!session.cancelled) {
            console.error(`[StreamingTTS] Playback error:`, err?.message);
          }
        }
      })
      .finally(() => {
        session.pendingSentences--;
        if (session.flushed && session.pendingSentences === 0) {
          this._finishSession(session);
        }
      });
  }

  /** Generate TTS for a sentence using the injected TTS service. */
  async _generateTts(voice, text) {
    try {
      const apiKey = this._getApiKeyFn?.();
      if (!apiKey) {
        return { success: false, error: 'No OpenAI API key configured for TTS' };
      }
      return await this._generateSpeechFn(text, voice, apiKey, { model: 'tts-1' });
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  /** Play an audio file via the system command, resolving when done. */
  _playAudio(session, audioPath) {
    return new Promise((resolve) => {
      if (session.cancelled) {
        this._cleanupFile(audioPath);
        resolve();
        return;
      }

      let cmd, args;
      if (process.platform === 'darwin') {
        cmd = 'afplay';
        args = [audioPath];
      } else if (process.platform === 'win32') {
        cmd = 'powershell';
        args = [
          '-NoProfile', '-NonInteractive', '-command',
          `$m = New-Object System.Windows.Media.MediaPlayer; $m.Open([uri]"${audioPath.replace(/\\/g, '\\\\')}"); $m.Play(); Start-Sleep 1; while($m.Position -lt $m.NaturalDuration.TimeSpan){Start-Sleep -Milliseconds 150}; $m.Close()`,
        ];
      } else {
        // Linux: try mpg123, fallback to ffplay
        cmd = 'mpg123';
        args = ['-q', audioPath];
      }

      const proc = spawn(cmd, args, { stdio: 'ignore' });
      session.activeProcess = proc;

      const done = () => {
        session.activeProcess = null;
        this._cleanupFile(audioPath);
        resolve();
      };

      proc.on('close', done);
      proc.on('error', () => done());
    });
  }

  _cleanupFile(filePath) {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  _finishSession(session) {
    this._emit('tts:finished', { runId: session.runId });
    this._sessions.delete(session.runId);
    console.log(`[StreamingTTS] Session finished: runId=${session.runId}`);
  }

  _emit(channel, payload) {
    this._broadcastFn?.(channel, payload);
  }
}

module.exports = new StreamingTtsOrchestrator();
