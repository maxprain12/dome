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
