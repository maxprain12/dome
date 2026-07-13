import ChatToolCard, {
  ChatToolCardGroup,
  SubagentToolSection,
} from '@/components/chat/ChatToolCard';
import type { ToolDisplayBlock } from '@/lib/chat/groupToolCalls';

export function manyToolBlockKey(block: ToolDisplayBlock, idx: number): string {
  if (block.type === 'tool') return block.call.id;
  if (block.type === 'tool-group') return `group:${block.name}:${idx}`;
  return `subagent:${block.agentKey}:${idx}`;
}

export function ManyToolDisplay({ block }: { block: ToolDisplayBlock }) {
  if (block.type === 'tool') {
    return <ChatToolCard toolCall={block.call} surfaceVariant="many" />;
  }
  if (block.type === 'tool-group') {
    return (
      <ChatToolCardGroup name={block.name} calls={block.calls} surfaceVariant="many" />
    );
  }
  return (
    <SubagentToolSection
      agentKey={block.agentKey}
      agentLabel={block.agentLabel}
      surfaceVariant="many"
    >
      {block.blocks.map((inner, innerIdx) =>
        inner.type === 'tool' ? (
          <ChatToolCard key={inner.call.id} toolCall={inner.call} surfaceVariant="many" />
        ) : (
          <ChatToolCardGroup
            key={`${inner.name}:${innerIdx}`}
            name={inner.name}
            calls={inner.calls}
            surfaceVariant="many"
          />
        ),
      )}
    </SubagentToolSection>
  );
}
