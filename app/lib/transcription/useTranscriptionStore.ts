import { create } from 'zustand';
import type { CaptureController } from './captureController';

export type TranscriptionSource = 'mic' | 'system';
export type TranscriptionPhase = 'idle' | 'recording' | 'paused' | 'transcribing' | 'error';

export interface TranscriptionStateBroadcast {
  sessionId: string | null;
  phase: TranscriptionPhase;
  sources: TranscriptionSource[];
  seconds: number;
  livePreview: boolean;
  partialText: string;
  error: string | null;
}

export interface TranscriptionSettings {
  sttProvider: 'openai' | 'groq' | 'custom';
  model: string;
  language: string | null;
  apiBaseUrl: string;
  prompt: string;
  pauseThresholdSec: number;
  hasOpenAIKey: boolean;
  hasGroqKey: boolean;
  globalShortcut: string;
  globalShortcutEnabled: boolean;
  defaultSources: TranscriptionSource[];
  liveTranscriptDefault: boolean;
  autoSummary: boolean;
  chunkSec: number;
  summaryModel: string;
}

export interface StartOptions {
  sources: TranscriptionSource[];
  systemSourceId?: string;
  livePreview: boolean;
  saveAudio: boolean;
  projectId?: string;
  folderId?: string | null;
}

interface State {
  // mirrored from main via transcription:state broadcast
  sessionId: string | null;
  phase: TranscriptionPhase;
  sources: TranscriptionSource[];
  seconds: number;
  livePreview: boolean;
  partialText: string;
  error: string | null;

  // UI-only flags
  isStartPopoverOpen: boolean;
  isLivePanelOpen: boolean;

  // settings
  settings: TranscriptionSettings | null;

  // capture controller (single active session)
  _controller: CaptureController | null;

  // actions
  loadSettings: () => Promise<void>;
  saveSettings: (patch: Partial<TranscriptionSettings>) => Promise<void>;
  start: (opts: StartOptions) => Promise<{ ok: boolean; error?: string }>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<{ ok: boolean; resourceId?: string; error?: string }>;
  cancel: () => Promise<void>;
  toggleRecord: () => Promise<void>;

  openStartPopover: () => void;
  closeStartPopover: () => void;
  toggleLivePanel: () => void;
  setLivePanelOpen: (open: boolean) => void;

  _onStateBroadcast: (payload: TranscriptionStateBroadcast) => void;
  _setController: (c: CaptureController | null) => void;
}

const idleState = {
  sessionId: null,
  phase: 'idle' as const,
  sources: [] as TranscriptionSource[],
  seconds: 0,
  livePreview: false,
  partialText: '',
  error: null,
};

export const useTranscriptionStore = create<State>((set, get) => ({
  ...idleState,
  isStartPopoverOpen: false,
  isLivePanelOpen: false,
  settings: null,
  _controller: null,

  async loadSettings() {
    try {
      const res = await window.electron?.transcription?.getSettings();
      if (res?.success && res.data) set({ settings: res.data as TranscriptionSettings });
    } catch (e) {
      console.warn('[transcription] loadSettings:', (e as Error).message);
    }
  },

  async saveSettings(patch) {
    try {
      const res = await window.electron?.transcription?.setSettings(patch);
      if (res?.success && (res as { data?: TranscriptionSettings }).data) {
        set({ settings: (res as { data: TranscriptionSettings }).data });
      } else {
        await get().loadSettings();
      }
    } catch (e) {
      console.warn('[transcription] saveSettings:', (e as Error).message);
    }
  },

  async start(opts) {
    if (get().phase !== 'idle') {
      return { ok: false, error: 'A session is already in progress' };
    }
    const { CaptureController } = await import('./captureController');
    const controller = new CaptureController();
    set({ _controller: controller });
    try {
      const result = await controller.start(opts);
      if (!result.ok) {
        set({ _controller: null });
        return result;
      }
      // The state broadcast will flip phase → 'recording' on its own.
      set({ isStartPopoverOpen: false });
      return { ok: true };
    } catch (err) {
      set({ _controller: null });
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },

  async pause() {
    const { sessionId, _controller } = get();
    if (!sessionId) return;
    _controller?.pause();
    await window.electron?.transcription?.sessionControl({ sessionId, action: 'pause' });
  },

  async resume() {
    const { sessionId, _controller } = get();
    if (!sessionId) return;
    _controller?.resume();
    await window.electron?.transcription?.sessionControl({ sessionId, action: 'resume' });
  },

  async stop() {
    const { sessionId, _controller } = get();
    if (!sessionId) return { ok: false, error: 'No active session' };
    try {
      await _controller?.flushAndStop();
    } catch (e) {
      console.warn('[transcription] flush:', (e as Error).message);
    }
    const res = await window.electron?.transcription?.sessionControl({ sessionId, action: 'stop' });
    set({ _controller: null });
    if (res?.success) return { ok: true, resourceId: res.resourceId };
    return { ok: false, error: res?.error };
  },

  async cancel() {
    const { sessionId, _controller } = get();
    _controller?.cancel();
    if (sessionId) {
      await window.electron?.transcription?.sessionControl({ sessionId, action: 'cancel' });
    }
    set({ _controller: null });
  },

  async toggleRecord() {
    const { phase } = get();
    if (phase === 'idle') {
      get().openStartPopover();
    } else if (phase === 'recording' || phase === 'paused') {
      await get().stop();
    }
  },

  openStartPopover() { set({ isStartPopoverOpen: true }); },
  closeStartPopover() { set({ isStartPopoverOpen: false }); },
  toggleLivePanel() { set((s) => ({ isLivePanelOpen: !s.isLivePanelOpen })); },
  setLivePanelOpen(open) { set({ isLivePanelOpen: open }); },

  _onStateBroadcast(payload) {
    set({
      sessionId: payload.sessionId,
      phase: payload.phase,
      sources: payload.sources || [],
      seconds: payload.seconds || 0,
      livePreview: Boolean(payload.livePreview),
      partialText: payload.partialText || '',
      error: payload.error ?? null,
      // Auto-collapse the live panel when we drop back to idle.
      isLivePanelOpen: payload.phase === 'idle' ? false : get().isLivePanelOpen,
    });
  },

  _setController(c) { set({ _controller: c }); },
}));
