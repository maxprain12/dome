import type { ReactNode } from 'react';
import type { ChatMessageData } from '@/lib/chat/types';

/** Many renders the canonical conversation presentation model. */
export type ManyMessageData = ChatMessageData;

/** What a conversation hands to whatever draws one message of a turn. */
export interface ManyMessageRenderProps {
  message: ManyMessageData;
  isLastInGroup: boolean;
  onRegenerate?: () => void;
}

/** Draws one message. The desktop Many draws it with every card it knows; a cloud Many with a lighter view. */
export type ManyMessageRenderer = (props: ManyMessageRenderProps) => ReactNode;

/** Context-compaction event surfaced to the Many UI after a run compacts history. */
export interface CompactionNoticeData {
  tokensBefore: number;
  tokensAfter: number | null;
  summaryPreview: string;
  automatic: boolean;
  at: number;
}
