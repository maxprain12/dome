'use strict';

const crypto = require('node:crypto');
const { formatWebCitation } = require('./citation.cjs');
const { MAX_PAGE_TEXT_CHARS } = require('./protocol.cjs');

const YT_RE =
  /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com']);

function canonicalizeHttpUrl(raw) {
  const parsed = new URL(String(raw || '').trim());
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported');
  }
  parsed.hash = '';
  const keys = [...parsed.searchParams.keys()].sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    if (/^utm_/i.test(key) || key === 'fbclid' || key === 'gclid' || key === 'si') {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.href;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function detectMediaKind(url, explicit) {
  if (explicit) return explicit;
  const host = hostnameOf(url);
  if (YT_RE.test(url) || host === 'youtu.be' || host === 'youtube.com') return 'youtube';
  if (VIDEO_HOSTS.has(host) || /\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  return 'article';
}

function youtubeId(url) {
  const m = String(url || '').match(YT_RE);
  return m ? m[1] : null;
}

function titleFromUrl(canonical) {
  try {
    const u = new URL(canonical);
    const host = u.hostname.replace(/^www\./i, '');
    let path = u.pathname === '/' ? '' : u.pathname;
    if (path.length > 48) path = `${path.slice(0, 45)}…`;
    const title = `${host}${path}`;
    return title.length > 96 ? `${title.slice(0, 93)}…` : title;
  } catch {
    return 'Link';
  }
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function createCaptureService(deps) {
  const {
    database,
    fileStorage = require('../storage/file-storage.cjs'),
    windowManager = { broadcast() {} },
    vaultStore = require('../storage/vault-store.cjs'),
    peopleStore = require('../people/people-store.cjs'),
    semanticIndexScheduler = require('../storage/semantic-index-scheduler.cjs'),
  } = deps;
  if (deps.semanticIndexScheduler == null) {
    semanticIndexScheduler.init(database);
  }

  function queries() {
    return database.getQueries();
  }

  function activeProjectId() {
    return queries().getSetting.get('last_project_id')?.value || 'default';
  }

  function listProjects() {
    return queries()
      .getProjects.all()
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  }

  function context() {
    const projectId = activeProjectId();
    const project = queries().getProjectById.get(projectId);
    return {
      projectId,
      projectName: project?.name || projectId,
      projects: listProjects(),
    };
  }

  function listNotes(projectId) {
    const pid = projectId || activeProjectId();
    return queries()
      .getResourcesByProject.all(pid)
      .filter((r) => r.type === 'note')
      .sort((a, b) => Number(b.updated_at) - Number(a.updated_at))
      .slice(0, 40)
      .map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updated_at,
      }));
  }

  function getNote(id) {
    const resource = queries().getResourceById.get(id);
    if (!resource || resource.type !== 'note') {
      const err = new Error('Note not found');
      err.statusCode = 404;
      throw err;
    }
    const mirror = vaultStore.readNoteMarkdown({ id }, { database, fileStorage });
    const markdown =
      mirror.success && typeof mirror.markdown === 'string' ? mirror.markdown : String(resource.content || '');
    return {
      id: resource.id,
      title: resource.title,
      projectId: resource.project_id,
      markdown,
      updatedAt: resource.updated_at,
      revision: crypto.createHash('sha256').update(JSON.stringify([resource.title, markdown])).digest('hex'),
    };
  }

  function bumpUpdatedAt(resource, { title, content, metadata, now }) {
    queries().updateResource.run(
      title ?? resource.title,
      content ?? resource.content,
      metadata != null ? JSON.stringify(metadata) : resource.metadata,
      now,
      resource.id,
    );
  }

  function createNote({ projectId, title, markdown }) {
    const pid = projectId || activeProjectId();
    const project = queries().getProjectById.get(pid);
    if (!project) {
      const err = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const body = typeof markdown === 'string' ? markdown : '';
    queries().createResource.run(id, pid, 'note', title, body, null, null, null, now, now);
    const mirror = vaultStore.writeNoteMarkdown({ id, markdown: body }, { database, fileStorage });
    if (!mirror.success) {
      queries().deleteResource.run(id);
      throw new Error(mirror.error || 'Could not write note');
    }
    const created = queries().getResourceById.get(id);
    windowManager.broadcast?.('resource:created', created);
    if (semanticIndexScheduler.shouldIndex?.(created) !== false) {
      semanticIndexScheduler.scheduleSemanticReindex(id);
    }
    return { ...getNote(id), domeLink: `dome://resource/${id}/note` };
  }

  function assertNoteFresh(resource, expectedUpdatedAt, expectedRevision) {
    const current = getNote(resource.id);
    // Indexing and metadata updates advance updated_at without changing the note.
    // New clients compare the actual title + Markdown; older clients retain timestamp checks.
    const fresh = expectedRevision
      ? current.revision === expectedRevision
      : Number(resource.updated_at) === Number(expectedUpdatedAt);
    if (!fresh) {
      const err = new Error('Note was edited elsewhere. Reload before saving.');
      err.statusCode = 409;
      err.payload = { conflict: true, note: current };
      throw err;
    }
  }

  function updateNote(id, { markdown, expectedUpdatedAt, expectedRevision, title }) {
    const resource = queries().getResourceById.get(id);
    if (!resource || resource.type !== 'note') {
      const err = new Error('Note not found');
      err.statusCode = 404;
      throw err;
    }
    assertNoteFresh(resource, expectedUpdatedAt, expectedRevision);
    const now = Date.now();
    if (title && title !== resource.title) {
      bumpUpdatedAt(resource, { title, content: resource.content, now });
    }
    const mirror = vaultStore.writeNoteMarkdown({ id, markdown }, { database, fileStorage });
    if (!mirror.success) throw new Error(mirror.error || 'Could not write note');
    const latest = queries().getResourceById.get(id);
    bumpUpdatedAt(latest, { title: title || latest.title, content: markdown, now });
    windowManager.broadcast?.('resource:updated', {
      id,
      updates: { content: markdown, vault_path: mirror.vaultPath, updated_at: now, title: title || latest.title },
    });
    semanticIndexScheduler.scheduleSemanticReindex(id);
    return getNote(id);
  }

  function appendSelection(id, payload) {
    const resource = queries().getResourceById.get(id);
    if (!resource || resource.type !== 'note') {
      const err = new Error('Note not found');
      err.statusCode = 404;
      throw err;
    }
    assertNoteFresh(resource, payload.expectedUpdatedAt, payload.expectedRevision);
    const current = getNote(id);
    const block = formatWebCitation({
      text: payload.text,
      title: payload.title,
      url: payload.url,
      capturedAt: payload.capturedAt,
    });
    return updateNote(id, {
      markdown: `${current.markdown || ''}${block}`,
      expectedUpdatedAt: payload.expectedUpdatedAt,
      expectedRevision: payload.expectedRevision,
      title: current.title,
    });
  }

  function saveContact(body) {
    const person = peopleStore.upsertIdentityPerson({
      projectId: body.projectId,
      source: body.source,
      externalId: body.externalId,
      displayName: body.displayName,
      displayLabel: body.displayLabel,
      avatarUrl: body.avatarUrl || undefined,
      primaryEmail: body.primaryEmail,
      meta: {
        pageUrl: body.pageUrl || null,
        capturedVia: 'browser_extension',
      },
    });
    const profile = {
      ...(person.profile || {}),
      ...(body.profile && typeof body.profile === 'object' ? body.profile : {}),
    };
    const updated = peopleStore.updateProfile({
      id: person.id,
      displayName: body.displayName,
      notes: body.notes,
      avatarUrl: body.avatarUrl || undefined,
      profile,
    });
    if (body.pageUrl) {
      peopleStore.addInteraction({
        personId: person.id,
        projectId: body.projectId,
        kind: 'capture',
        refType: 'url',
        summary: `Captured from ${body.pageUrl}`,
        payload: { url: body.pageUrl, source: body.source },
      });
    }
    return {
      person: updated || person,
      created: !person.identities || person.identities.length <= 1,
    };
  }

  function saveUrl(body) {
    const canonical = canonicalizeHttpUrl(body.url);
    const pid = body.projectId || activeProjectId();
    const project = queries().getProjectById.get(pid);
    if (!project) {
      const err = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }
    const existing = queries().findUrlResourceByCanonicalUrl.get(canonical, canonical);
    if (existing && existing.project_id === pid) {
      return {
        id: existing.id,
        title: existing.title,
        url: canonical,
        reused: true,
        domeLink: `dome://resource/${existing.id}/url`,
      };
    }

    const kind = detectMediaKind(canonical, body.mediaKind);
    const videoId = youtubeId(canonical);
    const title = String(body.title || '').trim() || titleFromUrl(canonical);
    const readable = String(body.readableText || '').slice(0, 50_000);
    const id = crypto.randomUUID();
    const now = Date.now();
    const metadata = {
      url: canonical,
      url_type: kind === 'youtube' ? 'youtube' : kind === 'video' ? 'article' : 'article',
      source: 'browser_extension',
      scraped_content: readable.slice(0, MAX_PAGE_TEXT_CHARS * 2),
      processing_status: 'completed',
      processed_at: now,
      ...(videoId ? { video_id: videoId } : {}),
      media_kind: kind,
    };
    queries().createResource.run(
      id,
      pid,
      'url',
      title,
      canonical,
      null,
      null,
      JSON.stringify(metadata),
      now,
      now,
    );
    const mirror = vaultStore.writeUrlMirror({ id }, { database, fileStorage });
    if (!mirror.success) {
      queries().deleteResource.run(id);
      throw new Error(mirror.error || 'Could not write URL mirror');
    }
    const created = queries().getResourceById.get(id);
    windowManager.broadcast?.('resource:created', created);
    semanticIndexScheduler.scheduleSemanticReindex(id);
    return {
      id,
      title,
      url: canonical,
      reused: false,
      mediaKind: kind,
      domeLink: `dome://resource/${id}/url`,
    };
  }

  return {
    context,
    listProjects,
    listNotes,
    getNote,
    createNote,
    updateNote,
    appendSelection,
    saveContact,
    saveUrl,
    canonicalizeHttpUrl,
    detectMediaKind,
    youtubeId,
  };
}

module.exports = { createCaptureService, canonicalizeHttpUrl, detectMediaKind, youtubeId };
