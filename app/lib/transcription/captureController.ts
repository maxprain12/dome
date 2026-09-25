/**
 * CaptureController — orchestrates one or two MediaRecorders (mic + system),
 * pushing each chunk to the main process via `transcription:session-append`.
 * When the session uses the realtime engine, a PcmStreamer also streams the
 * mixed audio via `transcription:session-audio` for live text.
 *
 * Pure TypeScript class (no React). The store owns the active instance.
 */

import type { StartOptions } from './useTranscriptionStore';
import type { TranscriptionErrorCode } from './errors';
import { isTranscriptionErrorCode } from './errors';
import { PcmStreamer } from './pcmStreamer';

interface TrackRecorder {
  stream: MediaStream;
  recorder: MediaRecorder;
  seq: number;
}

type TxApi = Window['electron']['transcription'];
type LiveEngine = 'realtime' | 'chunks' | null;
type AcquisitionResult =
  | { ok: true; micStream: MediaStream | null; sysStream: MediaStream | null }
  | { ok: false; error: TranscriptionErrorCode };
type SessionResult =
  | { ok: true; sessionId: string; liveEngine: LiveEngine }
  | { ok: false; error: TranscriptionErrorCode };

class CaptureError extends Error {
  constructor(readonly code: TranscriptionErrorCode) {
    super(code);
  }
}

// Keeps a getDisplayMedia video track alive so macOS ScreenCaptureKit doesn't
// terminate the capture session (and its audio loopback) after ~3 s of no
// video-frame consumption.
function attachVideoSink(stream: MediaStream): HTMLVideoElement | null {
  const videoTracks = stream.getVideoTracks();
  if (!videoTracks.length) return null;
  const videoSink = document.createElement('video');
  videoSink.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-1px;left:-1px;';
  videoSink.muted = true;
  videoSink.autoplay = true;
  videoSink.srcObject = new MediaStream(videoTracks);
  document.body.appendChild(videoSink);
  videoSink.play().catch(() => { /* silent */ });
  return videoSink;
}

function releaseVideoSink(sink: HTMLVideoElement | null) {
  if (!sink) return;
  try { sink.pause(); sink.srcObject = null; } catch { /* */ }
  try { sink.remove(); } catch { /* */ }
}

function stopStreamTracks(stream: MediaStream | null) {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
}

function isPermissionDenied(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
}

function codeFor(err: unknown, fallback: TranscriptionErrorCode): TranscriptionErrorCode {
  if (err instanceof CaptureError) return err.code;
  return fallback;
}

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false,
};

const SYS_CONSTRAINTS: MediaStreamConstraints = { audio: true, video: true };

const MIME_PREFERENCES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

function pickSupportedMime(): string {
  for (const m of MIME_PREFERENCES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return 'audio/webm';
}

export class CaptureController {
  private sessionId: string | null = null;
  private startedAt = 0;
  private chunkMs = 4000;
  private mic: TrackRecorder | null = null;
  private sys: TrackRecorder | null = null;
  private sysVideoSink: HTMLVideoElement | null = null;
  private cancelled = false;
  private pendingFlush: Array<Promise<void>> = [];
  private pcm: PcmStreamer | null = null;

  async start(opts: StartOptions): Promise<{ ok: boolean; error?: TranscriptionErrorCode }> {
    const tx = window.electron?.transcription;
    if (!tx) return { ok: false, error: 'transcription_failed' };

    // Acquire streams BEFORE creating the session — if permissions fail we don't
    // leave a half-started DB row.
    const acquired = await this.acquireStreams(opts, tx);
    if (!acquired.ok) return acquired;
    const { micStream, sysStream } = acquired;

    const session = await this.createSession(opts, tx);
    if (!session.ok) {
      stopStreamTracks(micStream);
      stopStreamTracks(sysStream);
      return { ok: false, error: session.error };
    }

    this.sessionId = session.sessionId;
    this.startedAt = performance.now();
    this.chunkMs = opts.livePreview ? 4000 : 15000;

    try {
      if (micStream) this.mic = this.attachRecorder(micStream, 'mic');
      if (sysStream) this.sys = this.attachRecorder(sysStream, 'system');
    } catch (err) {
      console.warn('[captureController] recorder setup:', err);
      this.rollbackFailedSetup(micStream, sysStream, tx);
      return { ok: false, error: 'transcription_failed' };
    }

    if (session.liveEngine === 'realtime') {
      await this.startPcmStream([micStream, sysStream].filter((s): s is MediaStream => s !== null), tx);
    }

    return { ok: true };
  }

  private async startPcmStream(streams: MediaStream[], tx: TxApi) {
    const sessionId = this.sessionId;
    if (!sessionId) return;
    const streamer = new PcmStreamer((buffer) => {
      if (this.cancelled) return;
      tx.sessionAudio({ sessionId, buffer })
        .then((res) => {
          if (res?.error === 'realtime_inactive' && this.pcm === streamer) {
            this.pcm = null;
            streamer.stop().catch(() => undefined);
          }
        })
        .catch(() => undefined);
    });
    try {
      await streamer.start(streams);
      this.pcm = streamer;
    } catch (err) {
      // Live text degrades to the chunks engine server-side; the archive keeps recording.
      console.warn('[captureController] PCM stream unavailable:', err);
      await streamer.stop();
    }
  }

  private async acquireStreams(opts: StartOptions, tx: TxApi): Promise<AcquisitionResult> {
    let micStream: MediaStream | null = null;
    let sysStream: MediaStream | null = null;
    try {
      if (opts.sources.includes('mic')) {
        micStream = await navigator.mediaDevices
          .getUserMedia(MIC_CONSTRAINTS)
          .catch((err: unknown) => {
            throw new CaptureError(isPermissionDenied(err) ? 'mic_permission_denied' : 'transcription_failed');
          });
      }
      if (opts.sources.includes('system')) {
        if (opts.systemSourceId) await tx.setDisplayMediaSource(opts.systemSourceId);
        // setDisplayMediaRequestHandler in main.cjs handles source routing.
        // We must request video so Electron opens the capture session (required to activate
        // the audio loopback), but we do NOT stop or remove the video track — doing so ends
        // the entire getDisplayMedia stream (including the audio track) immediately.
        // MediaRecorder is created with an audio-only mimeType so video is silently ignored.
        // All tracks are stopped together in flushAndStop()/cancel() when the session ends.
        sysStream = await navigator.mediaDevices
          .getDisplayMedia(SYS_CONSTRAINTS)
          .catch((err: unknown) => {
            throw new CaptureError(isPermissionDenied(err) ? 'screen_capture_permission' : 'system_audio_unavailable');
          });
        if (sysStream.getAudioTracks().length === 0) {
          stopStreamTracks(sysStream);
          throw new CaptureError('no_audio_track');
        }
        // Consume the video track in a hidden <video> element so the macOS
        // ScreenCaptureKit session (and its audio loopback) stays alive for
        // the full recording duration instead of dying after ~3 s idle.
        this.sysVideoSink = attachVideoSink(sysStream);
      }
    } catch (err) {
      stopStreamTracks(micStream);
      stopStreamTracks(sysStream);
      return { ok: false, error: codeFor(err, 'transcription_failed') };
    }
    return { ok: true, micStream, sysStream };
  }

  private async createSession(opts: StartOptions, tx: TxApi): Promise<SessionResult> {
    const startResult = await tx.sessionStart({
      sources: opts.sources,
      systemSourceId: opts.systemSourceId,
      projectId: opts.projectId,
      folderId: opts.folderId,
      livePreview: opts.livePreview,
      saveAudio: opts.saveAudio,
    });
    if (!startResult?.success || !startResult.sessionId) {
      const error = isTranscriptionErrorCode(startResult?.error) ? startResult.error : 'transcription_failed';
      return { ok: false, error };
    }
    return { ok: true, sessionId: startResult.sessionId, liveEngine: startResult.liveEngine ?? null };
  }

  // Recorder setup failed after the session was already created — cancel the
  // session in the main process so it doesn't linger, then release tracks.
  private rollbackFailedSetup(
    micStream: MediaStream | null,
    sysStream: MediaStream | null,
    tx: TxApi,
  ) {
    this.cancelled = true;
    releaseVideoSink(this.sysVideoSink);
    this.sysVideoSink = null;
    try { this.mic?.recorder.stop(); } catch { /* */ }
    if (this.sessionId) {
      tx.sessionControl({ sessionId: this.sessionId, action: 'cancel' }).catch(() => undefined);
    }
    stopStreamTracks(micStream);
    stopStreamTracks(sysStream);
    this.sessionId = null;
    this.mic = null;
    this.sys = null;
  }

  private attachRecorder(stream: MediaStream, track: 'mic' | 'system'): TrackRecorder {
    // Build an audio-only MediaStream for MediaRecorder. The source stream for system
    // audio includes a video track (required to keep the getDisplayMedia capture session
    // alive so the audio loopback doesn't end). MediaRecorder with an audio-only mimeType
    // will throw if the stream contains video tracks in Chromium/Electron.
    // The audio track objects are shared — they live or die with the source stream.
    const audioTracks = stream.getAudioTracks();
    const recStream = audioTracks.length < stream.getTracks().length
      ? new MediaStream(audioTracks)
      : stream;

    const recorder = new MediaRecorder(recStream, { mimeType: pickSupportedMime() });
    const trackState: TrackRecorder = { stream, recorder, seq: 0 };

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0 || this.cancelled || !this.sessionId) return;
      const seq = trackState.seq++;
      const startMs = Math.max(0, Math.round(performance.now() - this.startedAt));
      const blob = event.data;
      const flush = (async () => {
        try {
          const buffer = await blob.arrayBuffer();
          if (this.cancelled || !this.sessionId) return;
          await window.electron?.transcription?.sessionAppend({
            sessionId: this.sessionId,
            track,
            seq,
            startMs,
            buffer,
            extension: 'webm',
          });
        } catch (err) {
          console.warn(`[captureController] append ${track}#${seq}:`, (err as Error).message);
        }
      })();
      this.pendingFlush.push(flush);
    };

    recorder.onerror = (event) => {
      console.warn(`[captureController] ${track} recorder error:`, event);
    };

    recorder.start(this.chunkMs);
    return trackState;
  }

  pause() {
    this.pcm?.pause();
    try { if (this.mic?.recorder.state === 'recording') this.mic.recorder.pause(); } catch { /* */ }
    try { if (this.sys?.recorder.state === 'recording') this.sys.recorder.pause(); } catch { /* */ }
  }

  resume() {
    this.pcm?.resume();
    try { if (this.mic?.recorder.state === 'paused') this.mic.recorder.resume(); } catch { /* */ }
    try { if (this.sys?.recorder.state === 'paused') this.sys.recorder.resume(); } catch { /* */ }
  }

  /** Stop both recorders, await all in-flight chunk uploads, then release tracks. */
  async flushAndStop(): Promise<void> {
    const stopOne = (rec: TrackRecorder | null) => new Promise<void>((resolve) => {
      if (!rec) return resolve();
      const finalize = () => {
        try { rec.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
        resolve();
      };
      if (rec.recorder.state === 'inactive') return finalize();
      rec.recorder.addEventListener('stop', finalize, { once: true });
      try { rec.recorder.stop(); } catch { finalize(); }
    });
    await this.pcm?.stop();
    this.pcm = null;
    await Promise.all([stopOne(this.mic), stopOne(this.sys)]);
    releaseVideoSink(this.sysVideoSink);
    this.sysVideoSink = null;
    // Drain pending uploads (ondataavailable fires before 'stop' in spec-compliant browsers).
    await Promise.all(this.pendingFlush.splice(0, this.pendingFlush.length));
    this.mic = null;
    this.sys = null;
  }

  cancel() {
    this.cancelled = true;
    this.pcm?.stop().catch(() => undefined);
    this.pcm = null;
    releaseVideoSink(this.sysVideoSink);
    this.sysVideoSink = null;
    try { this.mic?.recorder.stop(); } catch { /* */ }
    try { this.sys?.recorder.stop(); } catch { /* */ }
    try { this.mic?.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
    try { this.sys?.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
    this.mic = null;
    this.sys = null;
  }

  getMicStream(): MediaStream | null { return this.mic?.stream ?? null; }
  getSystemStream(): MediaStream | null { return this.sys?.stream ?? null; }
}
