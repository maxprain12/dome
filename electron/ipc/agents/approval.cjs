/* eslint-disable no-console */
/**
 * In-app Approval IPC — replaces native dialog.showMessageBox for HITL flows.
 *
 * Main process broadcasts `approval:requested` to the originating renderer
 * window and waits for the renderer to respond with `approval:respond`.
 * A timeout auto-cancels the request.
 *
 * API (main process):
 *   approval.requestApproval({ kind, payload, senderId, timeoutMs? })
 *     → Promise<boolean>   // true = approved, false = cancelled/timeout
 *
 * IPC channels:
 *   approval:requested  — main → renderer (broadcast via windowManager)
 *   approval:respond    — renderer → main (invoke)
 */

const crypto = require('crypto');
const { webContents } = require('electron');
const { z } = require('zod');

const ApprovalRespondPayloadSchema = z.object({
  approvalId: z.string().min(1),
  approved: z.boolean(),
  /**
   * 'once' (default) answers this request only. 'session' also stops asking for
   * the rest of the conversation — the escape hatch for a long coding run where
   * every edit and command would otherwise need its own click.
   */
  scope: z.enum(['once', 'session']).optional(),
});

const DEFAULT_TIMEOUT_MS = 60_000;

// Pending approvals: approvalId → { resolve, timer, threadId }
const pending = new Map();

let _windowManager = null;
let _ipcMain = null;

/**
 * Register IPC handlers. Called once from ipc/index.cjs.
 * @param {{ ipcMain, windowManager, validateSender }} deps
 */
function register({ ipcMain, windowManager, validateSender }) {
  _ipcMain = ipcMain;
  _windowManager = windowManager;

  ipcMain.handle('approval:respond', (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = ApprovalRespondPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    const { approvalId, approved, scope } = parsed.data;

    if (!pending.has(approvalId)) {
      return { success: false, error: 'Unknown approvalId' };
    }

    const { resolve, timer, threadId } = pending.get(approvalId);
    clearTimeout(timer);
    pending.delete(approvalId);

    // Only an approval can widen the scope; a rejection never grants anything.
    if (approved && scope === 'session' && threadId) {
      require('../../agents/hitl-allowlist.cjs').approveAllForThread(threadId);
      console.log('[Approval] auto-approve enabled for thread:', threadId);
    }

    resolve(approved);
    return { success: true, scope: scope ?? 'once' };
  });
}

/**
 * Request user approval via an in-app Dome modal (non-blocking for renderer).
 *
 * @param {{ kind: string, payload: object, senderId: number, timeoutMs?: number }} opts
 * @returns {Promise<boolean>} Resolves true (approved) or false (cancelled/timeout).
 */
function requestApproval({ kind, payload, senderId, threadId = null, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!_windowManager) {
    console.warn('[Approval] windowManager not initialised — auto-cancelling');
    return Promise.resolve(false);
  }

  const approvalId = crypto.randomBytes(8).toString('hex');

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending.has(approvalId)) {
        pending.delete(approvalId);
        console.warn('[Approval] Timed out:', approvalId, kind);
        resolve(false);
      }
    }, timeoutMs);

    pending.set(approvalId, { resolve, timer, threadId });

    // Send to the specific renderer window that triggered the tool call.
    // `canRemember` tells the UI whether "approve for this chat" is meaningful:
    // without a thread there is nothing to scope the decision to.
    const message = { approvalId, kind, payload, timeoutMs, canRemember: Boolean(threadId) };
    try {
      const wc = webContents.fromId(senderId);
      if (!wc || wc.isDestroyed()) {
        clearTimeout(timer);
        pending.delete(approvalId);
        resolve(false);
        return;
      }
      wc.send('approval:requested', message);
    } catch (err) {
      console.error('[Approval] send error:', err?.message);
      clearTimeout(timer);
      pending.delete(approvalId);
      resolve(false);
    }
  });
}

module.exports = { register, requestApproval };
