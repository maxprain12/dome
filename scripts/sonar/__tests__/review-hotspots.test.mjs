import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyHotspot } from '../review-hotspots.mjs';

describe('classifyHotspot', () => {
  it('marks Math.random in app/ as SAFE', () => {
    const v = classifyHotspot({
      ruleKey: 'javascript:S2245',
      component: 'maxprain12_dome:app/lib/store/useTabStore.ts',
    });
    assert.equal(v?.resolution, 'SAFE');
  });

  it('marks shell-policy ReDoS as SAFE', () => {
    const v = classifyHotspot({
      ruleKey: 'javascript:S5852',
      component: 'maxprain12_dome:electron/core/shell-policy.cjs',
    });
    assert.equal(v?.resolution, 'SAFE');
  });

  it('acknowledges other ReDoS as debt', () => {
    const v = classifyHotspot({
      ruleKey: 'javascript:S5852',
      component: 'maxprain12_dome:app/components/chat/MarkdownRenderer.tsx',
    });
    assert.equal(v?.resolution, 'ACKNOWLEDGED');
  });

  it('acknowledges PATH hotspots', () => {
    const v = classifyHotspot({
      ruleKey: 'javascript:S4036',
      component: 'maxprain12_dome:electron/email/himalaya-binary.cjs',
    });
    assert.equal(v?.resolution, 'ACKNOWLEDGED');
  });
});
