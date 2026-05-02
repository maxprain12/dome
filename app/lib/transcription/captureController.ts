/**
 * CaptureController — orchestrates one or two MediaRecorders (mic + system),
 * pushing each chunk to the main process via `transcription:session-append`.
 *
 * Pure TypeScript class (no React). The store owns the active instance.
 */

import type { StartOptions } from './useTranscriptionStore';

interface TrackRecorder {
  stream: MediaStream;
  recorder: MediaRecorder;
  seq: number;
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

  async start(opts: StartOptions): Promise<{ ok: boolean; error?: string }> {
    const tx = window.electron?.transcription;
    if (!tx) return { ok: false, error: 'Transcription API unavailable' };

    // Acquire streams BEFORE creating the session — if permissions fail we don't
    // leave a half-started DB row.
    let micStream: MediaStream | null = null;
    let sysStream: MediaStream | null = null;
    try {
      if (opts.sources.includes('mic')) {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      }
      if (opts.sources.includes('system')) {
        if (opts.systemSourceId) {
          await tx.setDisplayMediaSource(opts.systemSourceId);
        }
        // setDisplayMediaRequestHandler in main.cjs handles source routing.
        // We must request video so Electron opens the capture session (required to activate
        // the audio loopback), but we do NOT stop or remove the video track — doing so ends
        // the entire getDisplayMedia stream (including the audio track) immediately.
        // MediaRecorder is created with an audio-only mimeType so video is silently ignored.
        // All tracks are stopped together in flushAndStop()/cancel() when the session ends.
        sysStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        if (sysStream.getAudioTracks().length === 0) {
          try { sysStream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
          throw new Error('Selected source has no audio track');
        }
        // Consume the video track in a hidden <video> element so the macOS
        // ScreenCaptureKit session (and its audio loopback) stays alive for
        // the full recording duration instead of dying after ~3 s idle.
        this.sysVideoSink = attachVideoSink(sysStream);
      }
    } catch (err) {
      try { micStream?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
      try { sysStream?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const startResult = await tx.sessionStart({
      sources: opts.sources,
      systemSourceId: opts.systemSourceId,
      projectId: opts.projectId,
      folderId: opts.folderId,
      livePreview: opts.livePreview,
      saveAudio: opts.saveAudio,
    });
    if (!startResult?.success || !startResult.sessionId) {
      try { micStream?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
      try { sysStream?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
      return { ok: false, error: startResult?.error || 'Failed to start session' };
    }

    this.sessionId = startResult.sessionId;
    this.startedAt = performance.now();
    this.chunkMs = opts.livePreview ? 4000 : 15000;

    try {
      if (micStream) this.mic = this.attachRecorder(micStream, 'mic');
      if (sysStream) this.sys = this.attachRecorder(sysStream, 'system');
    } catch (err) {
      // Recorder setup failed after session was already created — cancel the session
      // in the main process so it doesn't linger, then release tracks.
      this.cancelled = true;
      releaseVideoSink(this.sysVideoSink);
      this.sysVideoSink = null;
      try { this.mic?.recorder.stop(); } catch { /* */ }
      if (this.sessionId) try { tx.sessionControl({ sessionId: this.sessionId, action: 'cancel' }); } catch { /* */ }
      try { micStream?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
      try { sysStream?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
      this.sessionId = null;
      this.mic = null;
      this.sys = null;
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    return { ok: true };
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
    try { if (this.mic?.recorder.state === 'recording') this.mic.recorder.pause(); } catch { /* */ }
    try { if (this.sys?.recorder.state === 'recording') this.sys.recorder.pause(); } catch { /* */ }
  }

  resume() {
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
