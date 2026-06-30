import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArtifactHtmlDocument,
  parseArtifactHtmlDocument,
  isDomeArtifactHtml,
  artifactSidecarRelPath,
} from '../artifacts/artifact-vault-mirror.cjs';

describe('artifact-vault-mirror', () => {
  it('builds and parses a portable artifact HTML document', () => {
    const html = buildArtifactHtmlDocument({
      resource: { id: 'res-1', title: 'Tracker', updated_at: 1000 },
      artifact: { artifact_type: 'custom', linked_resource_id: null, version: 2 },
      state: {
        html: '<main><h1>Tracker</h1></main>',
        css: 'main{color:var(--primary-text)}',
        data: { items: [{ id: 'a', text: 'Buy milk' }] },
      },
    });

    assert.ok(isDomeArtifactHtml(html));
    const parsed = parseArtifactHtmlDocument(html);
    assert.ok(parsed);
    assert.equal(parsed.resourceId, 'res-1');
    assert.equal(parsed.artifactType, 'custom');
    assert.equal(parsed.data.items[0].text, 'Buy milk');
    assert.ok(parsed.html.includes('<main>'));
    assert.ok(!parsed.html.includes('dome-artifact-state'));
  });

  it('computes sidecar path next to artifact html', () => {
    assert.equal(artifactSidecarRelPath('Reports/Dashboard.html'), 'Reports/Dashboard.dome');
  });

  it('rejects non-dome html', () => {
    assert.equal(isDomeArtifactHtml('<html><body>plain</body></html>'), false);
    assert.equal(parseArtifactHtmlDocument('<html><body>plain</body></html>'), null);
  });
});
