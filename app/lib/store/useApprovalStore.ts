import { create } from 'zustand';

export interface ApprovalRequest {
  approvalId: string;
  kind: 'shell_exec' | 'tool_action' | string;
  payload: Record<string, unknown>;
  timeoutMs: number;
}

interface ApprovalStore {
  queue: ApprovalRequest[];
  enqueue: (req: ApprovalRequest) => void;
  dequeue: (approvalId: string) => void;
}

export const useApprovalStore = create<ApprovalStore>((set) => ({
  queue: [],
  enqueue: (req) =>
    set((state) => ({
      queue: [...state.queue, req],
    })),
  dequeue: (approvalId) =>
    set((state) => ({
      queue: state.queue.filter((r) => r.approvalId !== approvalId),
    })),
}));
