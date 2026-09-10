import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ManyComposerImage } from '../../../../../app/components/many/composer/ManyComposerSurface';
import type {
  ManyConversationSurfaceMessage,
  ManySurfaceToolCall,
} from '../../../../../app/components/many/conversation/ManyConversationSurface';
import type * as api from '../../lib/client';

export const MANY_PREFERENCE_KEYS = {
  model: 'dome.many.model',
  thinking: 'dome.many.thinkingLevel',
  tools: 'dome.many.toolsEnabled',
  resources: 'dome.many.resourceToolsEnabled',
  memory: 'dome.many.memoryEnabled',
} as const;

export function looksOpaque(value: string): boolean {
  return (
    /^(?:[a-z]{1,12}-)?[0-9a-f]{8}-[0-9a-f-]{27,}(?:\.[a-z0-9]+)?$/i.test(
      value,
    ) ||
    /^(?:sp|scamp|urn)[-:][a-z0-9:_-]+$/i.test(value) ||
    /^(?:call|tool|tc)[_:-][a-z0-9_-]{8,}$/i.test(value)
  );
}

export function readableLabel(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = value?.trim() ?? '';
  return normalized && !looksOpaque(normalized) ? normalized : fallback;
}

export function readableToolLabel(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = readableLabel(value, '');
  return normalized ? normalized.replaceAll('_', ' ') : fallback;
}

export function readableToolResult(value: string): string {
  const normalized = value.trim();
  return normalized && !looksOpaque(normalized) ? normalized : '';
}

export function preferredThinkingLevel(
  supported: api.ThinkingLevel[],
  stored: unknown,
): api.ThinkingLevel {
  if (
    typeof stored === 'string' &&
    supported.includes(stored as api.ThinkingLevel)
  ) {
    return stored as api.ThinkingLevel;
  }
  const preference: api.ThinkingLevel[] = [
    'medium',
    'low',
    'minimal',
    'high',
    'xhigh',
    'off',
  ];
  return preference.find((level) => supported.includes(level)) ?? 'off';
}

export function parseToolArguments(
  value: string | Record<string, unknown>,
): Record<string, unknown> {
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function formatUsage(
  usage: api.TokenUsage | null,
): string | undefined {
  if (!usage) return undefined;
  const total = Number.isFinite(usage.totalTokens) ? usage.totalTokens : 0;
  return `${new Intl.NumberFormat().format(total)} tokens`;
}

export function assistantMarkdown(message: ManyConversationSurfaceMessage) {
  return (
    <div className="rendered-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {message.text}
      </ReactMarkdown>
    </div>
  );
}

export async function fileToComposerImage(
  file: File,
): Promise<ManyComposerImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Invalid image'));
    reader.onerror = () => reject(reader.error ?? new Error('Invalid image'));
    reader.readAsDataURL(file);
  });
  return { id: crypto.randomUUID(), name: file.name || 'image', dataUrl };
}

export function updateTool(
  messages: ManyConversationSurfaceMessage[],
  messageId: string,
  toolId: string,
  update: (tool: ManySurfaceToolCall) => ManySurfaceToolCall,
) {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          tools: message.tools?.map((tool) =>
            tool.id === toolId ? update(tool) : tool,
          ),
        }
      : message,
  );
}
