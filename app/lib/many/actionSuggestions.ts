/**
 * Extract actionable draft suggestions from Many tool calls for inline cards.
 */

import type { ToolCallData } from '@/components/chat/ChatToolCard';

export type ActionSuggestionKind = 'github_issue' | 'email' | 'social_post';

export type ActionSuggestion = {
  id: string;
  kind: ActionSuggestionKind;
  toolName: string;
  title: string;
  fields: Array<{ label: string; value: string }>;
  /** Text to send via dome:quick-reply on confirm (when not HITL-gated yet). */
  confirmText: string;
};

function asRecord(args: unknown): Record<string, unknown> {
  if (!args) return {};
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v)).filter(Boolean);
}

const ACTION_TOOLS = new Set([
  'github_create_issue',
  'email_send',
  'email_reply',
  'social_post_draft',
  'social_post_publish',
]);

/**
 * Build suggestion cards from tool calls. Skips errored calls and empty drafts.
 */
export function extractActionSuggestions(toolCalls: ToolCallData[] | undefined): ActionSuggestion[] {
  if (!toolCalls?.length) return [];
  const out: ActionSuggestion[] = [];

  for (const call of toolCalls) {
    if (!ACTION_TOOLS.has(call.name)) continue;
    if (call.status === 'error') continue;
    const args = asRecord(call.arguments);

    switch (call.name) {
      case 'github_create_issue': {
        const title = str(args.title);
        if (!title) break;
        const assignees = strList(args.assignees);
        const fields: ActionSuggestion['fields'] = [
          { label: 'title', value: title },
          { label: 'repo', value: str(args.repo_id) || '—' },
        ];
        if (assignees.length) fields.push({ label: 'assignees', value: assignees.map((a) => `@${a}`).join(', ') });
        if (str(args.body)) fields.push({ label: 'body', value: str(args.body).slice(0, 200) });
        out.push({
          id: call.id,
          kind: 'github_issue',
          toolName: call.name,
          title: 'GitHub issue',
          fields,
          confirmText: `Yes, create the issue "${title}"${assignees.length ? ` assigned to ${assignees.map((a) => `@${a}`).join(', ')}` : ''}.`,
        });
        break;
      }
      case 'email_send':
      case 'email_reply': {
        const to = str(args.to);
        const subject = str(args.subject);
        const body = str(args.body);
        if (!to && !body) break;
        const fields: ActionSuggestion['fields'] = [
          { label: 'to', value: to || '—' },
        ];
        if (subject) fields.push({ label: 'subject', value: subject });
        if (body) fields.push({ label: 'body', value: body.slice(0, 200) });
        out.push({
          id: call.id,
          kind: 'email',
          toolName: call.name,
          title: call.name === 'email_reply' ? 'Email reply' : 'Email',
          fields,
          confirmText: `Yes, send the email${to ? ` to ${to}` : ''}${subject ? ` — ${subject}` : ''}.`,
        });
        break;
      }
      case 'social_post_draft':
      case 'social_post_publish': {
        const provider = str(args.provider) || str(args.platform) || 'social';
        const body = str(args.body) || str(args.caption) || str(args.text);
        if (!body) break;
        out.push({
          id: call.id,
          kind: 'social_post',
          toolName: call.name,
          title: call.name === 'social_post_publish' ? 'Publish post' : 'Social draft',
          fields: [
            { label: 'network', value: provider },
            { label: 'caption', value: body.slice(0, 280) },
          ],
          confirmText:
            call.name === 'social_post_publish'
              ? `Yes, publish the ${provider} post.`
              : `Yes, keep the ${provider} draft as proposed.`,
        });
        break;
      }
      default:
        break;
    }
  }

  return out;
}
