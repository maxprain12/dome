export type TranscriptionTrayAction = 'stop' | 'cancel' | 'pause-resume';

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
