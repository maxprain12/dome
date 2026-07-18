'use strict';

/* eslint-disable no-console */

/**
 * Sync Himalaya envelopes into SQLite + seed people identities (plan 004).
 */

const emailStore = require('./email-store.cjs');
const himalaya = require('./himalaya-service.cjs');

let _syncing = false;
let _lastStatus = { status: 'idle', lastSync: null, error: null };

function getStatus() {
  return { ..._lastStatus, syncing: _syncing };
}

function broadcast(channel, payload) {
  try {
    const wm = require('../core/window-manager.cjs');
    const instance = typeof wm.getInstance === 'function' ? wm.getInstance() : wm;
    if (instance?.broadcast) {
      instance.broadcast(channel, payload);
    } else if (typeof wm.broadcast === 'function') {
      wm.broadcast(channel, payload);
    }
  } catch {
    /* optional in tests */
  }
}

/**
 * Sync INBOX (and Sent if present) for one account.
 * Bodies are NOT fetched here — lazy on read.
 */
async function syncAccount(accountId, { projectId = null, maxPages = 5, pageSize = 100 } = {}) {
  if (!accountId) throw new Error('accountId required');

  const foldersRes = await himalaya.listFolders(accountId, projectId);
  if (!foldersRes.success) throw new Error(foldersRes.error || 'listFolders failed');

  const remoteFolders = foldersRes.folders || [];
  for (const f of remoteFolders) {
    emailStore.upsertFolder(accountId, f.name);
  }

  const targets = remoteFolders.filter((f) => {
    const n = String(f.name || '').toUpperCase();
    return n === 'INBOX' || n === 'SENT' || n.includes('SENT');
  });
  if (targets.length === 0 && remoteFolders[0]) {
    targets.push(remoteFolders[0]);
  }

  let upserted = 0;
  const peopleStore = require('../people/people-store.cjs');
  const listedAccounts = himalaya.listAccounts?.(projectId);
  const accountsList = Array.isArray(listedAccounts)
    ? listedAccounts
    : listedAccounts?.accounts || [];
  const accountRow = accountsList.find((a) => a.id === accountId);
  const peopleProjectId = accountRow?.project_id || projectId || 'default';

  for (const folder of targets) {
    const folderRow = emailStore.upsertFolder(accountId, folder.name);
    emailStore.setSyncState(accountId, folderRow.id, { status: 'syncing', error: null });

    try {
      for (let page = 1; page <= maxPages; page += 1) {
        // Always fetch live during sync — source=auto would return the local
        // cache and never refresh Himalaya (stuck on 1 wiped envelope).
        const res = await himalaya.listEnvelopes(accountId, {
          folder: folder.name,
          page,
          pageSize,
          projectId,
          source: 'live',
        });
        if (!res.success) throw new Error(res.error || 'listEnvelopes failed');
        const envelopes = res.envelopes || [];
        if (envelopes.length === 0) break;

        for (const env of envelopes) {
          const id = emailStore.upsertEnvelope(accountId, folderRow.id, env);
          if (id) upserted += 1;

          for (const addr of emailStore.extractAddressesFromEnvelope(env)) {
            try {
              peopleStore.upsertIdentityPerson({
                projectId: peopleProjectId,
                source: 'email',
                externalId: addr.email,
                displayName: addr.name || addr.email,
                displayLabel: addr.name || addr.email,
                primaryEmail: addr.email,
                meta: { from: 'email_sync' },
              });
            } catch {
              /* ignore people errors */
            }
          }
        }

        if (envelopes.length < pageSize) break;
      }

      emailStore.setSyncState(accountId, folderRow.id, {
        status: 'idle',
        lastSyncedAt: Date.now(),
        error: null,
      });
    } catch (err) {
      emailStore.setSyncState(accountId, folderRow.id, {
        status: 'error',
        error: err.message,
      });
      throw err;
    }
  }

  return { upserted, accountId };
}

async function syncNow({ accountId = null, projectId = null } = {}) {
  if (_syncing) return { success: false, error: 'Sync already running', ...getStatus() };
  _syncing = true;
  _lastStatus = { status: 'syncing', lastSync: _lastStatus.lastSync, error: null };
  broadcast('email:sync:status', getStatus());

  try {
    // listAccounts() returns `{ success, accounts }` — not a bare array.
    const listed = himalaya.listAccounts(projectId);
    const accounts = Array.isArray(listed) ? listed : listed?.accounts || [];
    const targets = accountId
      ? accounts.filter((a) => a.id === accountId)
      : accounts.filter((a) => a.status !== 'error');

    if (targets.length === 0) {
      throw new Error('No email account configured');
    }

    let total = 0;
    for (const acc of targets) {
      const result = await syncAccount(acc.id, { projectId: projectId || acc.project_id });
      total += result.upserted;
    }

    _lastStatus = { status: 'idle', lastSync: Date.now(), error: null };
    broadcast('email:sync:status', getStatus());
    broadcast('email:data:updated', { upserted: total });

    try {
      const sourceIndex = require('../search/source-index.cjs');
      for (const acc of targets) {
        sourceIndex.indexEmailMessages(acc.id);
      }
      sourceIndex.indexPeople(projectId || 'default');
    } catch (err) {
      console.warn('[email-sync] source index failed:', err.message);
    }

    return { success: true, upserted: total };
  } catch (err) {
    console.error('[email-sync] syncNow failed:', err.message);
    _lastStatus = { status: 'error', lastSync: _lastStatus.lastSync, error: err.message };
    broadcast('email:sync:status', getStatus());
    return { success: false, error: err.message };
  } finally {
    _syncing = false;
  }
}

module.exports = {
  syncNow,
  syncAccount,
  getStatus,
};
