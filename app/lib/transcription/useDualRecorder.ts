/**
 * useDualRecorder — two parallel MediaRecorder pipelines (mic + system) for call capture.
 * Composes {@link useMediaRecorder} twice with shared chunk interval and per-track chunk handlers.
 */

import { useCallback, useRef } from 'react';
import { useMediaRecorder, type UseMediaRecorderReturn } from '@/lib/transcription/useMediaRecorder';

const noopBlob = async () => {};

export interface UseDualRecorderOptions {
  chunkIntervalMs: number;
  onMicChunk: (blob: Blob, mimeType: string) => void | Promise<void>;
  onSystemChunk: (blob: Blob, mimeType: string) => void | Promise<void>;
  onMicError?: (message: string) => void;
}

export interface UseDualRecorderReturn {
  mic: UseMediaRecorderReturn;
  system: UseMediaRecorderReturn;
  pauseBoth: () => void;
  resumeBoth: () => void;
  stopBoth: () => void;
  cancelBoth: () => void;
}

export function useDualRecorder({
  chunkIntervalMs,
  onMicChunk,
  onSystemChunk,
  onMicError,
}: UseDualRecorderOptions): UseDualRecorderReturn {
  const mic = useMediaRecorder({
    onBlob: noopBlob,
    chunksOnly: true,
    chunkIntervalMs,
    onChunk: onMicChunk,
    onError: onMicError,
  });

  const system = useMediaRecorder({
    onBlob: noopBlob,
    chunksOnly: true,
    chunkIntervalMs,
    onChunk: onSystemChunk,
  });

  const micR = useRef(mic);
  const sysR = useRef(system);
  micR.current = mic;
  sysR.current = system;

  const pauseBoth = useCallback(() => {
    micR.current.pauseRecording();
    sysR.current.pauseRecording();
  }, []);

  const resumeBoth = useCallback(() => {
    micR.current.resumeRecording();
    sysR.current.resumeRecording();
  }, []);

  const stopBoth = useCallback(() => {
    micR.current.stopRecording();
    sysR.current.stopRecording();
  }, []);

  const cancelBoth = useCallback(() => {
    micR.current.cancelRecording();
    sysR.current.cancelRecording();
  }, []);

  return { mic, system, pauseBoth, resumeBoth, stopBoth, cancelBoth };
}
