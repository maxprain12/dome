export type TranscriptionTrayAction = 'stop' | 'cancel' | 'pause-resume';

export function parseTrayActionPayload(payload: unknown): TranscriptionTrayAction | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const a = (payload as { action?: unknown }).action;
  if (a === 'stop' || a === 'cancel' || a === 'pause-resume') return a;
  return null;
}

type Handlers = {
  onStop?: () => void;
  onCancel?: () => void;
  onPauseResume?: () => void;
};

let handlers: Handlers = {};

export function setTranscriptionTrayHandlers(next: Handlers | null): void {
  handlers = next ? { ...next } : {};
}

export function dispatchTranscriptionTrayAction(action: TranscriptionTrayAction): void {
  switch (action) {
    case 'stop':
      handlers.onStop?.();
      break;
    case 'cancel':
      handlers.onCancel?.();
      break;
    case 'pause-resume':
      handlers.onPauseResume?.();
      break;
    default:
      break;
  }
}
