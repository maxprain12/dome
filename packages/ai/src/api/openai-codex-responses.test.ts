import { describe, expect, it } from 'vitest';
import { getBuiltinModel } from '../providers/all.js';
import { normalizeContext } from '../utils/transcript.js';
import { stream } from './openai-codex-responses.js';

function codexToken(): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
  const header = encode({ alg: 'none', typ: 'JWT' });
  const payload = encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct_test' } });
  return `${header}.${payload}.sig`;
}

describe('openai-codex request body', () => {
  it('omits temperature because the Codex backend rejects that parameter', async () => {
    const model = getBuiltinModel('openai-codex', 'gpt-5.6-sol');
    let captured: Record<string, unknown> | undefined;
    const events = stream(model, normalizeContext({ messages: [{ role: 'user', content: 'hola', timestamp: 0 }] }), {
      apiKey: codexToken(),
      temperature: 0.4,
      transport: 'sse',
      onPayload: (body) => {
        captured = body as Record<string, unknown>;
      },
      fetch: async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    });

    for await (const _event of events) {
      /* drain */
    }
    await events.result();

    expect(captured).toBeDefined();
    expect(captured).not.toHaveProperty('temperature');
  });
});
