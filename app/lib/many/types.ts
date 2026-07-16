import type { ChatMessageData } from '@/components/chat/ChatMessage';

/** Many renders the canonical conversation presentation model. */
export type ManyMessageData = ChatMessageData;

/** Context-compaction event surfaced to the Many UI after a run compacts history. */
export interface CompactionNoticeData {
  tokensBefore: number;
  tokensAfter: number | null;
  summaryPreview: string;
  automatic: boolean;
  at: number;
}
