import ChatMessage from '@/components/chat/ChatMessage';
import type { ManyMessageBodyProps } from './types';

/**
 * Many intentionally consumes the shared conversation message renderer.
 * Runtime payloads remain unchanged; only the surface variant differs.
 */
export default function ManyMessageBody(props: ManyMessageBodyProps) {
  return <ChatMessage {...props} surfaceVariant="many" />;
}
