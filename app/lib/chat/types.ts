import type { PersistentRunStep } from '@/lib/automations/api';
import type { StructuredMessageAttachments } from '@/lib/chat/attachmentTypes';
import type { PdfRegionMeta } from '@/lib/store/useManyStore';
import type { ParsedCitation } from '@/lib/utils/citations';

/** One tool call of an assistant turn, as every chat surface (local Many, agents, cloud Manys) stores it. */
export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
  /** Name of the subagent that produced this call (deepagents `task` delegation). */
  agentName?: string;
  /**
   * Characters of assistant text emitted before this call, used to interleave
   * the card at the point of the reply where it actually happened.
   * Absent on messages restored from storage, which fall back to tools-first.
   */
  contentOffset?: number;
}

/** One message of a chat transcript, shared by every chat surface. */
export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCalls?: ToolCallData[];
  citationMap?: Map<number, ParsedCitation>;
  /** Reasoning/chain-of-thought from models (qwen3, etc.) */
  thinking?: string;
  /** Custom label for streaming placeholder (e.g. "Ejecutando herramientas...") */
  streamingLabel?: string;
  /** Optional label for multi-agent chats or system phases */
  agentLabel?: string;
  /** PDF region (cloud vision) — show handoff actions */
  pdfRegionMeta?: PdfRegionMeta;
  /** Structured image attachments for resolving dome-att:// placeholders */
  attachments?: StructuredMessageAttachments;
  /** Pins that rode with this user turn (Many transcript chips). */
  pinnedResources?: Array<{
    id: string;
    title: string;
    type: string;
    kind?: 'person' | 'resource' | 'issue' | 'email' | 'social_post' | 'social_campaign' | 'social_reference' | 'social_profile';
  }>;
  /** Skills invoked with this user turn (shown as chips, not raw /tokens). */
  skills?: Array<{ id: string; name: string }>;
  /** Structured run steps streamed from the agent runtime / run engine. */
  runSteps?: PersistentRunStep[];
}
