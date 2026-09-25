/* AudioWorklet: mono Float32 → PCM16 little-endian frames for realtime STT. */

const FRAME_SAMPLES = 2400; // 100 ms at 24 kHz

class Pcm16CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i += 1) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.frame[this.filled] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.filled += 1;
      if (this.filled === FRAME_SAMPLES) {
        const out = this.frame.buffer;
        this.port.postMessage(out, [out]);
        this.frame = new Int16Array(FRAME_SAMPLES);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm16-capture', Pcm16CaptureProcessor);
