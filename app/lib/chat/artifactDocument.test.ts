import { expect, it } from 'vitest';
import { buildSrcdocFromParts, artifactFrameTargetOrigin } from './artifactDocument';

it('escapes injected data so a closing script cannot create executable markup', () => {
  const doc = buildSrcdocFromParts('<main id="app"></main>', { text: '</script><script>bad()</script>' }, '', '');
  const parsed = new DOMParser().parseFromString(doc, 'text/html');
  expect(doc).not.toContain('window.DOME_DATA = {"text":"</script>');
  expect([...parsed.scripts].some((script) => script.textContent === 'bad()')).toBe(false);
});
it('installs the persistence bridge before author code and accepts only parent commands', () => {
  const doc = buildSrcdocFromParts('<script>window.__dome_updateState({ready:true})</script>', {}, '', '');
  expect(doc.indexOf('window.__dome_updateState = function')).toBeLessThan(doc.indexOf('window.__dome_updateState({ready:true})'));
  expect(doc).toContain('e.source !== window.parent');
  expect(doc).toContain("document.addEventListener('input', saveForm");
  expect(artifactFrameTargetOrigin(null)).toBe('*');
  expect(artifactFrameTargetOrigin('app://artifact/token')).toBe('*');
});

it('collects legacy state only from the requested iframe and cancels cleanly', async () => {
  const { requestArtifactState } = await import('./artifactDocument');
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const target = frame.contentWindow!;
  const original = target.postMessage;
  target.postMessage = ((message: { requestId: string }) => {
    window.dispatchEvent(new MessageEvent('message', { source: target, origin: 'null', data: { type: 'dome:state:snapshot', requestId: 'unrelated', payload: { wrong: true } } }));
    window.dispatchEvent(new MessageEvent('message', { source: target, origin: 'null', data: { type: 'dome:state:snapshot', requestId: message.requestId, payload: { count: 3 } } }));
  }) as typeof target.postMessage;
  expect(await requestArtifactState(target)).toEqual({ count: 3 });
  target.postMessage = original;
  const controller = new AbortController();
  controller.abort();
  await expect(requestArtifactState(target, controller.signal)).rejects.toThrow('Cancelled');
  frame.remove();
});
