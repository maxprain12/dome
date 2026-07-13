/**
 * Chat Components
 *
 * Modular chat UI components inspired by clawdbot's design
 */

export { ChatToolMarker, ChatToolGroupMarker } from './ChatToolMarker';
export { ChatStateMarker, ChatSeparatorMarker } from './ChatStateMarker';
export { default as ReadingIndicator } from './ReadingIndicator';
export { default as ChatMessage, type ChatMessageData, type ChatSurfaceVariant } from './ChatMessage';
export { default as ChatToolCard, type ToolCallData, type ChatToolSurfaceVariant } from './ChatToolCard';
export { default as ChatMessageGroup } from './ChatMessageGroup';
export { groupMessagesByRole } from '@/lib/chat/groupMessagesByRole';
export { default as MarkdownRenderer } from './MarkdownRenderer';
export { default as CitationBadge } from './CitationBadge';
export { default as SourceReference } from './SourceReference';
