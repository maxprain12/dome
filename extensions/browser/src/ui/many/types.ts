import type { ReactNode } from 'react';
import type * as api from '../../lib/client';
import type { PageContext } from '../../lib/browser-context';

export type Task = 'agent' | 'capture' | 'note' | 'contact';
export type ManyAssistantView = 'chat' | 'history' | 'context';
export type RunPhase =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'resuming';

export interface RunExecution {
  streamId: string;
  messageId: string;
  generation: number;
  awaitingApproval?: boolean;
}

export interface ManyAssistantHandle {
  startNewChat: () => void;
  clearChat: () => void;
}

export interface ManyAssistantHeaderState {
  status: 'idle' | 'thinking';
  sessionTitle?: string;
  canClear: boolean;
  interactionLocked: boolean;
}

export interface ManyAssistantProps {
  view: ManyAssistantView;
  task: Task;
  projectId: string;
  tabId?: number;
  token: string;
  getContext: () => string;
  page: PageContext;
  browserTools: ReactNode;
  disabled: boolean;
  onOpenChat: () => void;
  onHeaderStateChange: (state: ManyAssistantHeaderState) => void;
  onApply?: (markdown: string) => boolean;
}

export interface PendingApproval {
  streamId: string;
  messageId: string;
  generation: number;
  actionRequests: api.ApprovalActionRequest[];
  reviewConfigs: api.ApprovalReviewConfig[];
}

export interface CompactionState {
  tokensBefore: number;
  tokensAfter: number | null;
  summaryPreview: string;
  automatic: boolean;
}
