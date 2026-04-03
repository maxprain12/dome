/**
 * RealtimeVoiceSession
 *
 * Manages a single OpenAI Realtime API session from the renderer process
 * using WebRTC (the recommended browser-side connection method for GA).
 *
 * Flow:
 *   1. Main process creates an ephemeral token (POST /v1/realtime/client_secrets)
 *   2. Renderer creates RTCPeerConnection + data channel
 *   3. SDP offer → POST /v1/realtime/calls with Bearer token → SDP answer
 *   4. Events flow bidirectionally over the RTCDataChannel (same JSON format as WebSocket)
 *   5. Mic audio goes as a WebRTC audio track — no manual PCM encoding needed
 *   6. Model audio comes back as a remote WebRTC track — browser plays it natively
 */

export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'recording'
  | 'processing'
  | 'speaking'
  | 'error';

export type RealtimeVoiceMode = 'server_vad' | 'ptt';

interface StartOptions {
  /** BCP-47 language code ('es' | 'en' | 'fr' | 'pt') */
  language: string;
  /** Full system prompt for the Realtime session */
  systemPrompt: string;
  /** Turn detection mode — server_vad = automatic, ptt = manual commit */
  mode?: RealtimeVoiceMode;
}

// Language → OpenAI Realtime voice mapping
// Using 'echo' (warm male voice) for Many's friendly personality across all languages
const VOICE_FOR_LANGUAGE: Record<string, string> = {
  en: 'echo',
  es: 'echo',
  fr: 'echo',
  pt: 'echo',
};

import { REALTIME_TOOLS } from './realtimeTools';

export class RealtimeVoiceSession {
  // ── Event callbacks ────────────────────────────────────
  onTranscriptDelta: ((delta: string) => void) | null = null;
  onTranscriptDone: ((full: string) => void) | null = null;
  onUserTranscript: ((text: string) => void) | null = null;
  onStatusChange: ((status: RealtimeStatus) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  /** Called when the model requests closing the session (e.g. user said goodbye) */
  onCloseRequested: (() => void) | null = null;

  // ── Private state ──────────────────────────────────────
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private captureStream: MediaStream | null = null;
  private _status: RealtimeStatus = 'idle';
  private _transcript = '';
  private _closeAfterResponse = false;

  // ── Status ─────────────────────────────────────────────
  private setStatus(s: RealtimeStatus) {
    if (this._status === s) return;
    this._status = s;
    this.onStatusChange?.(s);
  }

  get status(): RealtimeStatus { return this._status; }

  // ── Public API ─────────────────────────────────────────

  /**
   * Open a Realtime session via WebRTC.
   * 1. Get config + ephemeral token from main process.
   * 2. Create RTCPeerConnection + data channel.
   * 3. Add mic audio track.
   * 4. SDP exchange with /v1/realtime/calls using ephemeral token.
   */
  async start(opts: StartOptions): Promise<void> {
    if (this.pc) this.close();
    this._transcript = '';
    this.setStatus('connecting');

    // 1. Get session config
    const cfg = await window.electron.realtime!.getSessionConfig();
    if (!cfg.success) {
      this.setStatus('error');
      this.onError?.(cfg.error);
      throw new Error(cfg.error);
    }
    const { voice: cfgVoice, model } = cfg;

    // 2. Derive voice from language
    const voice = cfgVoice !== 'shimmer'
      ? cfgVoice
      : (VOICE_FOR_LANGUAGE[opts.language] ?? 'shimmer');

    // 3. Acquire mic
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.captureStream = stream;

    // 4. Create peer connection
    const pc = new RTCPeerConnection();
    this.pc = pc;

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.setStatus('error');
        this.onError?.('WebRTC connection failed');
      }
    };

    // 5. Remote audio — model speaks through this element
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    this.remoteAudio = audioEl;
    pc.ontrack = (e) => {
      if (e.streams?.[0]) audioEl.srcObject = e.streams[0];
    };

    // 6. Add mic track
    stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

    // 7. Data channel — bidirectional events
    const dc = pc.createDataChannel('oai-events');
    this.dc = dc;

    dc.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data as string); } catch { return; }
      this._handleServerEvent(msg);
    };

    dc.onerror = () => {
      this.setStatus('error');
      this.onError?.('Data channel error');
    };

    // 8. SDP offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 9. SDP exchange via main process (unified interface)
    //    Main process POSTs FormData { sdp, session } to /v1/realtime/calls
    //    with the real API key — no ephemeral token needed.
    // POST /v1/realtime/calls does not accept `session.turn_detection` on current GA models.
    // PTT vs continuous speech: overlay uses `commitAudio()` when mode is `ptt`.
    const sessionConfig: Record<string, unknown> = {
      type: 'realtime',
      model,
      instructions: opts.systemPrompt,
      audio: { output: { voice } },
      tools: REALTIME_TOOLS,
      tool_choice: 'auto',
    };

    const sdpRes = await window.electron.realtime!.exchangeSdp({
      sdp: offer.sdp!,
      sessionConfig,
    });

    if (!sdpRes.success) {
      this.stopCapture();
      pc.close();
      this.pc = null;
      this.setStatus('error');
      this.onError?.(sdpRes.error);
      throw new Error(sdpRes.error);
    }

    await pc.setRemoteDescription({ type: 'answer', sdp: sdpRes.sdp });
    // session.created arrives via data channel → sets status to 'ready'
  }

  /**
   * No-op — mic capture is set up during start() via WebRTC track.
   * Kept for API compatibility with HUD code.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  startCapture(_stream: MediaStream): void { /* handled by WebRTC track in start() */ }

  /** Stop mic tracks. */
  stopCapture(): void {
    this.captureStream?.getTracks().forEach((t) => t.stop());
    this.captureStream = null;
  }

  /**
   * PTT mode: commit the audio buffer and request a response.
   * In server_vad mode this is not needed — the server handles turn detection.
   */
  /** PTT mode: request a response turn. */
  commitAudio(): void {
    this._send({ type: 'response.create' });
    this.setStatus('processing');
  }

  /** Cancel the current model response (user interrupts). */
  cancel(): void {
    this._send({ type: 'response.cancel' });
  }

  /** Close the session and clean up all resources. */
  close(): void {
    this.stopCapture();
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.setStatus('idle');
  }

  // ── Private: server event dispatch ────────────────────

  private _handleServerEvent(msg: Record<string, unknown>) {
    const type = msg.type as string;

    switch (type) {
      case 'session.created':
        // Session config was passed in the SDP exchange — no session.update needed
        this.setStatus('ready');
        break;

      case 'input_audio_buffer.speech_started':
        this.setStatus('recording');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.setStatus('processing');
        break;

      // GA: response.output_audio.delta  |  beta: response.audio.delta
      case 'response.audio.delta':
      case 'response.output_audio.delta':
        // Audio plays natively via the remote WebRTC track — no manual decode needed
        if (this._status !== 'speaking') this.setStatus('speaking');
        break;

      // GA: response.output_audio_transcript.delta  |  beta: response.audio_transcript.delta
      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta': {
        const delta = msg.delta as string;
        if (delta) {
          this._transcript += delta;
          this.onTranscriptDelta?.(delta);
        }
        break;
      }

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
        this.onTranscriptDone?.(this._transcript);
        this._transcript = '';
        break;

      case 'response.input_audio_transcription.completed':
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = msg.transcript as string;
        if (transcript) this.onUserTranscript?.(transcript);
        break;
      }

      case 'response.function_call_arguments.done': {
        void this._handleToolCall(
          msg.call_id as string,
          msg.name as string,
          msg.arguments as string,
        );
        break;
      }

      case 'response.done':
        this.setStatus('idle');
        if (this._closeAfterResponse) {
          this._closeAfterResponse = false;
          // Small delay so the farewell audio finishes playing
          setTimeout(() => this.onCloseRequested?.(), 1200);
        }
        break;

      case 'error': {
        const err = msg.error as Record<string, unknown>;
        const errMsg = (err?.message as string) ?? 'Unknown Realtime API error';
        this.onError?.(errMsg);
        this.setStatus('error');
        break;
      }

      default:
        break;
    }
  }

  private async _handleToolCall(callId: string, name: string, argsJson: string) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(argsJson); } catch { /* noop */ }

    // close_session is handled client-side — no IPC needed
    if (name === 'close_session') {
      this._closeAfterResponse = true;
      this._send({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId, output: '{"ok":true}' },
      });
      this._send({ type: 'response.create' });
      return;
    }

    let output = '{}';
    try {
      const result = await window.electron.realtime!.executeTool({ name, args });
      output = result.success
        ? (result as { success: true; output: string }).output
        : JSON.stringify({ error: (result as { success: false; error: string }).error });
    } catch (e) {
      output = JSON.stringify({ error: String(e) });
    }

    this._send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output,
      },
    });
    this._send({ type: 'response.create' });
  }

  // ── Private: data channel send ─────────────────────────

  private _send(msg: unknown): void {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(msg));
    }
  }
}
