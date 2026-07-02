import assert from 'node:assert/strict';
import {
  capLangChainTools,
  providerNeedsOpenAiToolCap,
} from '../electron/tools/tool-cap.cjs';

const tools = Array.from({ length: 130 }, (_, i) => ({ name: `tool_${i}` }));
tools[0] = { name: 'task' };
tools[1] = { name: 'dome_load_doc' };

const capped = capLangChainTools(tools, { provider: 'openai', model: 'gpt-5.4' });
assert.equal(capped.length, 128);
assert.equal(capped[0].name, 'task');
assert.equal(capped[1].name, 'dome_load_doc');

// Under the limit → untouched, regardless of provider.
const few = tools.slice(0, 100);
assert.equal(capLangChainTools(few, { provider: 'openai', model: 'gpt-5.4' }).length, 100);

// Providers without the OpenAI tools[] cap are never trimmed.
assert.equal(capLangChainTools(tools, { provider: 'anthropic', model: 'claude-3' }).length, 130);

assert.equal(providerNeedsOpenAiToolCap('openrouter', 'openai/gpt-5.4'), true);
assert.equal(providerNeedsOpenAiToolCap('anthropic', 'claude-3'), false);

console.log('test-tool-cap: ok');
