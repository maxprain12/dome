import { create } from 'zustand';

export interface MediaPlaybackSnapshot {
  currentTime: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
}

const DEFAULT_SNAPSHOT: MediaPlaybackSnapshot = {
  currentTime: 0,
  volume: 1,
  isMuted: false,
  playbackRate: 1,
};

interface MediaPlaybackState {
  byResourceId: Record<string, MediaPlaybackSnapshot>;
  setPartial: (resourceId: string, partial: Partial<MediaPlaybackSnapshot>) => void;
  getForResource: (resourceId: string) => MediaPlaybackSnapshot;
}

export const useMediaPlaybackStore = create<MediaPlaybackState>((set, get) => ({
  byResourceId: {},

  setPartial: (resourceId, partial) => {
    if (!resourceId) return;
    set((state) => {
      const prev = state.byResourceId[resourceId] ?? { ...DEFAULT_SNAPSHOT };
      return {
        byResourceId: {
          ...state.byResourceId,
          [resourceId]: { ...prev, ...partial },
        },
      };
    });
  },

  getForResource: (resourceId) => {
    const s = get().byResourceId[resourceId];
    return s ? { ...DEFAULT_SNAPSHOT, ...s } : { ...DEFAULT_SNAPSHOT };
  },
}));
