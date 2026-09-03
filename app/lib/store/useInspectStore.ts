import { create } from 'zustand';

export type InspectPinKind = 'person' | 'resource' | 'issue' | 'email' | 'social_post';

export type InspectToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
};

export type InspectTarget =
  | { kind: 'person'; personId: string; title?: string }
  | { kind: 'entity'; id: string; title: string; entityType: string; pinKind?: InspectPinKind }
  | { kind: 'tool'; toolCall: InspectToolCall };

interface InspectState {
  target: InspectTarget | null;
  open: (target: InspectTarget) => void;
  close: () => void;
}

export const useInspectStore = create<InspectState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
