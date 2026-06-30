'use strict';

/**
 * Serialize / parse Dome artifact HTML mirrors in the project vault.
 * Each artifact is a single portable `.html` file with embedded metadata JSON.
 */

const DOME_ARTIFACT_META = 'dome-artifact';
const STATE_SCRIPT_ID = 'dome-artifact-state';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsonForScript(json) {
  return JSON.stringify(json).replace(/<\//g, '<\\/');
}

/**
 * @param {string} raw
 */
function isDomeArtifactHtml(raw) {
  const s = String(raw || '');
  return (
    s.includes(`name="${DOME_ARTIFACT_META}"`) ||
    s.includes(`id="${STATE_SCRIPT_ID}"`) ||
    s.includes(`id='${STATE_SCRIPT_ID}'`)
  );
}

/**
 * Build a portable HTML document for vault storage.
 * @param {{
 *   resource: { id: string, title?: string|null, updated_at?: number|null },
 *   artifact: { artifact_type?: string|null, linked_resource_id?: string|null, version?: number|null },
 *   state: Record<string, unknown>,
 * }} payload
 */
function buildArtifactHtmlDocument(payload) {
  const { resource, artifact, state } = payload;
  const htmlBody = typeof state.html === 'string' ? state.html : '';
  const css = typeof state.css === 'string' ? state.css : '';
  const data =
    state.data !== undefined && state.data !== null && typeof state.data === 'object' && !Array.isArray(state.data)
      ? state.data
      : {};
  const linkedData =
    state.linkedData !== undefined &&
    state.linkedData !== null &&
    typeof state.linkedData === 'object' &&
    !Array.isArray(state.linkedData)
      ? state.linkedData
      : null;

  const title = escapeHtml(resource?.title || 'Untitled Artifact');
  const statePayload = {
    version: 1,
    resourceId: resource?.id || null,
    artifactType: artifact?.artifact_type || 'custom',
    linkedResourceId: artifact?.linked_resource_id ?? null,
    artifactVersion: Number(artifact?.version ?? 1),
    updatedAt: resource?.updated_at ?? null,
    data,
    ...(linkedData ? { linkedData } : {}),
  };

  const domeData = linkedData ? { ...data, linkedData } : data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="${DOME_ARTIFACT_META}" content="1">
<meta name="dome-resource-id" content="${escapeHtml(resource?.id || '')}">
<meta name="dome-artifact-type" content="${escapeHtml(artifact?.artifact_type || 'custom')}">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
${htmlBody}
<script type="application/json" id="${STATE_SCRIPT_ID}">
${escapeJsonForScript(statePayload)}
</script>
<script>window.DOME_DATA = ${escapeJsonForScript(domeData)};</script>
</body>
</html>
`;
}

/**
 * @param {string} raw
 * @returns {{
 *   resourceId: string|null,
 *   artifactType: string,
 *   linkedResourceId: string|null,
 *   artifactVersion: number,
 *   html: string,
 *   css: string,
 *   data: Record<string, unknown>,
 *   linkedData: Record<string, unknown>|null,
 * }|null}
 */
function parseArtifactHtmlDocument(raw) {
  const text = String(raw || '');
  if (!isDomeArtifactHtml(text)) return null;

  const stateMatch = text.match(
    new RegExp(`<script[^>]*id=["']${STATE_SCRIPT_ID}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'),
  );
  /** @type {Record<string, unknown>} */
  let meta = {};
  if (stateMatch) {
    try {
      const parsed = JSON.parse(stateMatch[1].trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const resourceId =
    typeof meta.resourceId === 'string' && meta.resourceId.trim() ? meta.resourceId.trim() : null;
  const artifactType =
    typeof meta.artifactType === 'string' && meta.artifactType.trim() ? meta.artifactType.trim() : 'custom';
  const linkedResourceId =
    typeof meta.linkedResourceId === 'string' && meta.linkedResourceId.trim()
      ? meta.linkedResourceId.trim()
      : null;

  let css = '';
  const styleMatch = text.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) css = styleMatch[1];

  let html = text;
  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    html = bodyMatch[1]
      .replace(
        new RegExp(`<script[^>]*id=["']${STATE_SCRIPT_ID}["'][\\s\\S]*?<\\/script>`, 'gi'),
        '',
      )
      .replace(/<script>\s*window\.DOME_DATA\s*=[\s\S]*?<\/script>/i, '')
      .trim();
  }

  const data =
    meta.data !== undefined && meta.data !== null && typeof meta.data === 'object' && !Array.isArray(meta.data)
      ? /** @type {Record<string, unknown>} */ (meta.data)
      : {};
  const linkedData =
    meta.linkedData !== undefined &&
    meta.linkedData !== null &&
    typeof meta.linkedData === 'object' &&
    !Array.isArray(meta.linkedData)
      ? /** @type {Record<string, unknown>} */ (meta.linkedData)
      : null;

  return {
    resourceId,
    artifactType,
    linkedResourceId,
    artifactVersion: Number(meta.artifactVersion ?? 1),
    html,
    css,
    data,
    linkedData,
  };
}

/** Sidecar directory next to an artifact HTML file: `Title.dome/` */
function artifactSidecarRelPath(htmlVaultPath) {
  const posix = String(htmlVaultPath || '').replace(/\\/g, '/');
  const base = posix.replace(/\.html$/i, '');
  return `${base}.dome`;
}

module.exports = {
  DOME_ARTIFACT_META,
  STATE_SCRIPT_ID,
  isDomeArtifactHtml,
  buildArtifactHtmlDocument,
  parseArtifactHtmlDocument,
  artifactSidecarRelPath,
};
