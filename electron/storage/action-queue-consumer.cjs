'use strict';

/**
 * Action queue consumer — desktop side of the `actions` domain (contract §3.4).
 * Pulls pending actions, claims them via conditional push (the server only
 * accepts `claimed` if the row is still `pending`), dispatches locally and
 * reports `done|failed` with a result payload.
 */
/* eslint-disable no-console */

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');
const { getOrCreateDeviceId } = require('./device-id.cjs');
const planGate = require('./plan-gate.cjs');

const PULL_LIMIT = 500;
const ACTION_KINDS = new Set([
  'run_stage_agent',
  'publish_now',
  'pause_post',
  'resume_post',
  'cancel_post',
  'reschedule_post',
  'move_item',
]);

let running = false;

/** Cursor persisted in domain_sync_state under the pseudo-domain 'actions'. */
function getCursor(db) {
  const row = db.prepare("SELECT last_pull_cursor FROM domain_sync_state WHERE domain = 'actions'").get();
  return row?.last_pull_cursor ?? '0';
}

function setCursor(db, cursor) {
  const now = Date.now();
  db.prepare(
    `
      INSERT INTO domain_sync_state (domain, last_pull_cursor, last_push_at, enabled, updated_at)
      VALUES ('actions', ?, 0, 1, ?)
      ON CONFLICT(domain) DO UPDATE SET last_pull_cursor = excluded.last_pull_cursor, updated_at = excluded.updated_at
    `,
  ).run(String(cursor), now);
}

async function pushActionRow(database, row) {
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const db = database.getDB();
  const res = await domeOauth.fetchWithDomeAuth(database, `${base}/api/v1/data/actions/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: getOrCreateDeviceId(db),
      rows: { action_queue: [row] },
      tombstones: [],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`actions_push_failed:${res.status} ${text}`);
  }
  const data = await res.json();
  const rejected = (data.rejected || []).some((r) => r.id === row.id);
  const skipped = (data.skipped || []).some((r) => r.id === row.id);
  return { applied: !rejected && !skipped, rejected, skipped };
}

/**
 * Move a pipeline card, mirroring the pipelines:items:move IPC handler
 * (splice into destination order + renumber source stage + auto-run hook).
 */
function moveItem(deps, payload) {
  const { database, windowManager } = deps;
  const queries = database.getQueries();
  const db = database.getDB();
  const item = queries.getPipelineItemById.get(payload.itemId);
  if (!item) throw new Error(`item_not_found:${payload.itemId}`);
  const targetStage = queries.getPipelineStageById.get(payload.stageId);
  if (!targetStage) throw new Error(`stage_not_found:${payload.stageId}`);
  const fromStageId = item.stage_id;
  const now = Date.now();

  const tx = db.transaction(() => {
    const dest = queries.listItemsByStage.all(payload.stageId).filter((r) => r.id !== payload.itemId);
    const insertAt = Number.isInteger(payload.position)
      ? Math.max(0, Math.min(payload.position, dest.length))
      : dest.length;
    dest.splice(insertAt, 0, { id: payload.itemId });
    dest.forEach((r, idx) => {
      queries.updatePipelineItemStageAndPosition.run(payload.stageId, idx, now, r.id);
    });
    if (fromStageId !== payload.stageId) {
      const remaining = queries.listItemsByStage.all(fromStageId);
      remaining.forEach((r, idx) => {
        queries.updatePipelineItemStageAndPosition.run(fromStageId, idx, now, r.id);
      });
    }
  });
  tx();

  windowManager?.broadcast?.('pipelines:updated', { pipelineId: item.pipeline_id });

  if (targetStage.execution_policy === 'auto_agent' && fromStageId !== payload.stageId) {
    const pipelineRunner = require('../agents/pipeline-runner.cjs');
    void pipelineRunner.triggerStageRun(payload.itemId).catch((e) => {
      console.warn('[actions] auto-run after remote move failed:', e?.message);
    });
  }
  return { itemId: payload.itemId, stageId: payload.stageId };
}

/**
 * @param {object} deps { database, windowManager }
 * @param {{ kind: string, payload: Record<string, unknown> }} action
 */
async function dispatchAction(deps, action) {
  const { database, windowManager } = deps;
  const payload = action.payload || {};

  switch (action.kind) {
    case 'run_stage_agent': {
      if (!payload.itemId) throw new Error('missing_itemId');
      const pipelineRunner = require('../agents/pipeline-runner.cjs');
      const updated = await pipelineRunner.triggerStageRun(String(payload.itemId), { force: true });
      return { itemId: payload.itemId, execStatus: updated?.execStatus ?? 'triggered' };
    }
    case 'move_item': {
      if (!payload.itemId || !payload.stageId) throw new Error('missing_itemId_or_stageId');
      return moveItem(deps, {
        itemId: String(payload.itemId),
        stageId: String(payload.stageId),
        position: Number(payload.position),
      });
    }
    case 'publish_now':
    case 'pause_post':
    case 'resume_post':
    case 'cancel_post':
    case 'reschedule_post': {
      if (!payload.postId) throw new Error('missing_postId');
      const { getSocialService } = require('../social/social-service.cjs');
      const service = getSocialService(database, windowManager);
      const postId = String(payload.postId);
      let result;
      if (action.kind === 'publish_now') {
        result = await service.publishPost(postId);
      } else if (action.kind === 'pause_post') {
        result = service.store.updatePost(postId, { status: 'draft' });
      } else if (action.kind === 'resume_post') {
        result = service.store.updatePost(postId, { status: 'scheduled' });
      } else if (action.kind === 'cancel_post') {
        result = service.store.updatePost(postId, { status: 'draft', scheduledAt: null });
      } else {
        const scheduledAt = Number(payload.scheduledAt);
        if (!Number.isFinite(scheduledAt)) throw new Error('missing_scheduledAt');
        result = service.store.updatePost(postId, { status: 'scheduled', scheduledAt });
      }
      windowManager?.broadcast?.('social:posts-refresh', {});
      return { postId, status: result?.status ?? 'ok' };
    }
    default:
      throw new Error(`unknown_kind:${action.kind}`);
  }
}

/**
 * Pull pending actions, claim, dispatch and report. Safe to call concurrently
 * (re-entrancy guard) and cheap when there is nothing pending.
 * @param {object} deps { database, windowManager }
 */
async function processActionQueue(deps) {
  if (running) return { success: true, skipped: true, reason: 'already_running' };
  running = true;
  try {
    const gate = await planGate.assertFeature(deps.database, 'cloud_sync');
    if (!gate.ok) return { success: true, skipped: true, reason: gate.reason };

    const db = deps.database.getDB?.();
    if (!db) return { success: false, error: 'no_database' };

    const deviceId = getOrCreateDeviceId(db);
    const base = getDomeProviderBaseUrl().replace(/\/$/, '');
    let cursor = getCursor(db);
    let processed = 0;
    let pages = 0;

    for (;;) {
      const url = `${base}/api/v1/data/actions/pull?since=${encodeURIComponent(cursor)}&limit=${PULL_LIMIT}`;
      const res = await domeOauth.fetchWithDomeAuth(deps.database, url, { method: 'GET' });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `${res.status} ${text}` };
      }
      const data = await res.json();
      const actions = data.rows?.action_queue || data.rows?.actions || [];
      const now = Date.now();

      for (const action of actions) {
        if (!action?.id || action.status !== 'pending') continue;
        if (!ACTION_KINDS.has(action.kind)) continue;
        if (Number(action.expires_at) > 0 && Number(action.expires_at) < now) continue;

        const claim = await pushActionRow(deps.database, {
          id: action.id,
          status: 'claimed',
          claimed_by: deviceId,
          claimed_at: Date.now(),
          updated_at: Date.now(),
        });
        if (!claim.applied) continue; // someone else claimed it first

        let status = 'done';
        let result;
        try {
          result = await dispatchAction(deps, action);
        } catch (err) {
          status = 'failed';
          result = { error: err instanceof Error ? err.message : String(err) };
          console.warn(`[actions] dispatch failed (${action.kind} ${action.id}):`, result.error);
        }
        await pushActionRow(deps.database, {
          id: action.id,
          status,
          result,
          updated_at: Date.now(),
        });
        processed += 1;
        deps.windowManager?.broadcast?.('domain-sync:action-processed', {
          id: action.id,
          kind: action.kind,
          status,
        });
      }

      cursor = data.nextSince ?? cursor;
      pages += 1;
      if (!data.hasMore) break;
      if (pages > 20) {
        console.warn('[actions] pull pagination safety stop');
        break;
      }
    }

    setCursor(db, cursor);
    return { success: true, processed };
  } finally {
    running = false;
  }
}

module.exports = { processActionQueue };
