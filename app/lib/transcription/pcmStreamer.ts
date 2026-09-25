/**
 * Mixes the capture streams to mono PCM16 @ 24 kHz and ships ~100 ms frames to
 * the main process for the realtime STT engine. The MediaRecorder archive runs
 * independently; this only feeds live text.
 */

const SAMPLE_RATE = 24000;
/** Served from public/ so it stays same-origin (`script-src 'self'`); Vite would inline it as a data: URL. */
const WORKLET_URL = '/worklets/pcm16-capture.js';

export class PcmStreamer {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private sources: MediaStreamAudioSourceNode[] = [];
  private paused = false;

  constructor(private readonly onFrame: (buffer: ArrayBuffer) => void) {}

  async start(streams: MediaStream[]): Promise<void> {
    const withAudio = streams.filter((s) => s.getAudioTracks().length > 0);
    if (withAudio.length === 0) return;

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await context.audioWorklet.addModule(WORKLET_URL);
    const node = new AudioWorkletNode(context, 'pcm16-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (!this.paused) this.onFrame(event.data);
    };

    // Several sources on one input are summed: mic + system become one mono mix.
    this.sources = withAudio.map((stream) => {
      const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      source.connect(node);
      return source;
    });

    // Keep the graph pulled without playing anything back.
    const mute = context.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(context.destination);

    this.context = context;
    this.node = node;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  async stop(): Promise<void> {
    for (const source of this.sources) {
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.sources = [];
    if (this.node) this.node.port.onmessage = null;
    this.node = null;
    const context = this.context;
    this.context = null;
    await context?.close().catch(() => undefined);
  }
}
