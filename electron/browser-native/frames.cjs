'use strict';
const { command } = require('./cdp.cjs');
const { assertDomain } = require('./options.cjs');
async function frames(contents, options) {
  const { frameTree } = await command(contents, 'Page.getFrameTree');
  const result = [];
  function visit(tree) {
    for (const child of tree.childFrames || []) {
      try { assertDomain(child.frame.url, options); if (/^https?:/.test(child.frame.url)) result.push(child.frame); } catch { /* Out-of-scope frames are not exposed. */ }
      visit(child);
    }
  }
  visit(frameTree);
  return result.slice(0, 20);
}
async function evaluate(contents, frameId, expression, signal) {
  const { executionContextId } = await command(contents, 'Page.createIsolatedWorld', { frameId, worldName: 'dome-agent-frame' }, signal);
  const response = await command(contents, 'Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true, awaitPromise: true }, signal);
  if (response.exceptionDetails) throw new Error('Frame changed or JavaScript evaluation failed');
  return { value: response.result.value, contextId: executionContextId };
}
module.exports = { frames, evaluate };
