'use strict';
const { randomUUID } = require('node:crypto');
const { z } = require('zod');
const { getOrRefreshSession, getDomeProviderBaseUrl } = require('../../auth/dome-oauth.cjs');

/**
 * Live sockets to a Many's computer: its screen and its terminal.
 *
 * A renderer cannot set the Authorization header on a WebSocket, and the session token must not
 * live there anyway, so the main process opens the socket and relays text frames. Each channel
 * belongs to the window that opened it; closing the window closes its channels.
 */
const MAX_CHANNELS_PER_WINDOW = 4;
const MAX_SEND_CHARS = 256 * 1024;
const MAX_FRAME_CHARS = 24 * 1024 * 1024;
const OPEN_TIMEOUT_MS = 20000;
const OpenSchema = z.object({ manyId: z.uuid(), channel: z.enum(['stream', 'terminal']) }).strict();
const SendSchema = z.object({ channelId: z.uuid(), data: z.string().min(1).max(MAX_SEND_CHARS) }).strict();
const CloseSchema = z.object({ channelId: z.uuid() }).strict();

const defaultSocket = (url, headers) => new WebSocket(url, { headers });

function register({
  ipcMain,
  windowManager,
  database,
  createSocket = defaultSocket,
  getSession = () => getOrRefreshSession(database),
  providerUrl = getDomeProviderBaseUrl,
}) {
  const channels = new Map();
  const watched = new WeakSet();

  const closeChannel = (channelId, code = 1000) => {
    const entry = channels.get(channelId);
    if (!entry) return;
    channels.delete(channelId);
    try {
      entry.socket.close(code);
    } catch {
      // Already closing.
    }
  };
  const ownedBy = (senderId) => [...channels.entries()].filter(([, entry]) => entry.senderId === senderId);

  ipcMain.handle('manys:channel:open', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'unauthorized' };
    const parsed = OpenSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: 'invalid_request' };
    if (ownedBy(event.sender.id).length >= MAX_CHANNELS_PER_WINDOW) return { success: false, error: 'too_many_channels' };
    let session;
    try {
      session = await getSession();
    } catch {
      return { success: false, error: 'not_connected' };
    }
    if (!session?.connected || !session.accessToken) return { success: false, error: 'not_connected' };
    const base = String(providerUrl()).replace(/\/$/, '').replace(/^http/, 'ws');
    const url = `${base}/api/v1/manys/${parsed.data.manyId}/computer/${parsed.data.channel}`;
    const channelId = randomUUID();
    let socket;
    try {
      socket = createSocket(url, { authorization: `Bearer ${session.accessToken}` });
    } catch {
      return { success: false, error: 'channel_unavailable' };
    }
    const sender = event.sender;
    const notify = (message) => {
      if (!sender.isDestroyed()) sender.send('manys:channel:event', { channelId, ...message });
    };
    const opened = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), OPEN_TIMEOUT_MS);
      socket.onopen = () => {
        clearTimeout(timer);
        resolve(true);
      };
      socket.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      socket.onclose = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
    if (!opened) {
      try {
        socket.close();
      } catch {
        // Never opened.
      }
      return { success: false, error: 'channel_unavailable' };
    }
    channels.set(channelId, { socket, senderId: sender.id });
    socket.onmessage = (message) => {
      if (typeof message.data === 'string' && message.data.length <= MAX_FRAME_CHARS) notify({ type: 'message', data: message.data });
    };
    socket.onclose = (closed) => {
      channels.delete(channelId);
      notify({ type: 'close', code: closed?.code ?? 1006 });
    };
    socket.onerror = () => undefined;
    if (!watched.has(sender)) {
      watched.add(sender);
      sender.once('destroyed', () => ownedBy(sender.id).forEach(([id]) => closeChannel(id, 1001)));
    }
    return { success: true, data: { channelId } };
  });

  ipcMain.handle('manys:channel:send', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'unauthorized' };
    const parsed = SendSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: 'invalid_request' };
    const entry = channels.get(parsed.data.channelId);
    if (!entry || entry.senderId !== event.sender.id) return { success: false, error: 'channel_closed' };
    if (entry.socket.readyState !== 1) return { success: false, error: 'channel_closed' };
    try {
      entry.socket.send(parsed.data.data);
    } catch {
      return { success: false, error: 'channel_closed' };
    }
    return { success: true };
  });

  ipcMain.handle('manys:channel:close', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'unauthorized' };
    const parsed = CloseSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: 'invalid_request' };
    const entry = channels.get(parsed.data.channelId);
    if (entry && entry.senderId === event.sender.id) closeChannel(parsed.data.channelId);
    return { success: true };
  });
}

module.exports = { register };
