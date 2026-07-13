import type { ChatMessageData } from '@/components/chat/ChatMessage';

/** Many uses the canonical conversation presentation model. */
export type ManyMessageData = ChatMessageData;

export interface ManyMessageBodyProps {
  message: ManyMessageData;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onRegenerate?: () => void;
  onSaveAsNote?: (content: string) => void;
  onClickCitation?: (number: number) => void;
}
