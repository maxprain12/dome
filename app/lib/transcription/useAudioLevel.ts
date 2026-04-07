/**
 * useAudioLevel
 * Returns a normalized audio level (0–1) from a MediaStream using Web Audio API.
 * Updates at ~60fps via requestAnimationFrame.
 * Returns 0 when stream is null or AudioContext is unavailable.
 */

import { useEffect, useRef, useState } from 'react';

export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }

    const AudioContextClass =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      setLevel(0);
      return;
    }

    const ctx = new AudioContextClass();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    contextRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / (dataArray.length * 255);
      setLevel(avg);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      try { source.disconnect(); } catch { /* ignore */ }
      try { ctx.close(); } catch { /* ignore */ }
      contextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
      setLevel(0);
    };
  }, [stream]);

  return level;
}
