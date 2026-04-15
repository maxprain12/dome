/* eslint-disable no-console */
/**
 * Realtime Voice IPC Handlers
 *
 * Supports the OpenAI Realtime API (WebSocket STS) running in the overlay renderer.
 * Main process responsibilities:
 *   - Retrieve the OpenAI API key from the database
 *   - Create ephemeral session tokens (keeps real key out of renderer URL bar)
 *   - Execute tool calls on behalf of the Realtime session
 */

const https = require('https');
const { getOpenAIKey } = require('../openai-key.cjs');

function register({ ipcMain, windowManager, database }) {
  // ─────────────────────────────────────────────────────
  // realtime:get-session-config
  // Returns { apiKey, voice, model } for the realtime session.
  // Used as fallback if ephemeral token creation fails.
  // ─────────────────────────────────────────────────────
  ipcMain.handle('realtime:get-session-config', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const apiKey = getOpenAIKey(database);
      if (!apiKey) {
        return {
          success: false,
          error: 'OpenAI API key not configured. Add it in Settings → Transcripción or AI.',
        };
      }
      const queries = database.getQueries();
      const rtOff = queries.getSetting.get('many_voice_realtime_enabled');
      if (rtOff?.value === '0' || rtOff?.value === 'false') {
        return { success: false, error: 'Realtime voice is disabled in Settings → Transcripción.' };
      }
      const voiceRow = queries.getSetting.get('realtime_voice');
      const modelRow = queries.getSetting.get('realtime_model');
      const suffixRow = queries.getSetting.get('realtime_instructions_suffix');
      return {
        success: true,
        voice: voiceRow?.value || 'shimmer',
        model: modelRow?.value || 'gpt-4o-realtime-preview',
        instructionsSuffix: suffixRow?.value ? String(suffixRow.value) : '',
      };
    } catch (err) {
      console.error('[Realtime IPC] get-session-config error:', err);
      return { success: false, error: err.message };
    }
  });

  // ─────────────────────────────────────────────────────
  // realtime:create-ephemeral-token
  // Tries the GA endpoint first (/v1/realtime/client_secrets),
  // then falls back to the beta endpoint (/v1/realtime/sessions).
  // Returns the short-lived token the renderer uses as the
  // api_key query param in the WebSocket URL.
  // ─────────────────────────────────────────────────────
  ipcMain.handle('realtime:create-ephemeral-token', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const apiKey = getOpenAIKey(database);
      if (!apiKey) {
        return { success: false, error: 'No OpenAI key configured. Add it in Settings → Transcription.' };
      }
      const model = typeof params?.model === 'string' ? params.model : 'gpt-4o-realtime-preview';
      const voice = typeof params?.voice === 'string' ? params.voice : 'shimmer';

      // Helper to make a POST request and return parsed JSON
      const postJson = (path, body, extraHeaders = {}) => new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        const req = https.request(
          {
            hostname: 'api.openai.com',
            path,
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
              ...extraHeaders,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
              catch { reject(new Error('Failed to parse response')); }
            });
          },
        );
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
      });

      // 1. Try GA endpoint: POST /v1/realtime/client_secrets
      //    Body: { session: { type: "realtime", model, audio: { output: { voice } } } }
      //    Response: { value: "ek_..." }
      let clientSecret = null;
      try {
        const gaRes = await postJson('/v1/realtime/client_secrets', {
          session: { type: 'realtime', model, audio: { output: { voice } } },
        });
        if (gaRes.status === 200 && gaRes.body?.value) {
          clientSecret = gaRes.body.value;
          console.log('[Realtime IPC] Ephemeral token via GA endpoint');
        }
      } catch (e) {
        console.warn('[Realtime IPC] GA ephemeral token failed:', e?.message);
      }

      // 2. Fallback: beta endpoint POST /v1/realtime/sessions
      if (!clientSecret) {
        try {
          const betaRes = await postJson(
            '/v1/realtime/sessions',
            { model, voice },
            { 'OpenAI-Beta': 'realtime=v1' },
          );
          if (betaRes.status === 200 && betaRes.body?.client_secret?.value) {
            clientSecret = betaRes.body.client_secret.value;
            console.log('[Realtime IPC] Ephemeral token via beta endpoint');
          } else if (betaRes.body?.error) {
            console.warn('[Realtime IPC] Beta endpoint error:', betaRes.body.error);
          }
        } catch (e) {
          console.warn('[Realtime IPC] Beta ephemeral token failed:', e?.message);
        }
      }

      if (!clientSecret) {
        return { success: false, error: 'Could not create ephemeral token. Check your OpenAI API key and Realtime API access.' };
      }
      return { success: true, clientSecret };
    } catch (err) {
      console.error('[Realtime IPC] create-ephemeral-token error:', err);
      return { success: false, error: err.message };
    }
  });

  // ─────────────────────────────────────────────────────
  // realtime:exchange-sdp  (WebRTC SDP exchange)
  //
  // Correct OpenAI Realtime WebRTC flow:
  //   1. Create ephemeral token: POST /v1/realtime/sessions
  //      → { client_secret: { value: "ek_..." } }
  //   2. SDP exchange: POST /v1/realtime?model={model}
  //      Authorization: Bearer {ephemeral_token}
  //      Content-Type: application/sdp
  //      Body: SDP offer text
  //      → SDP answer text
  //
  // The renderer never touches the API key.
  // ─────────────────────────────────────────────────────
  ipcMain.handle('realtime:exchange-sdp', async (event, { sdp, sessionConfig }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const apiKey = getOpenAIKey(database);
      if (!apiKey) {
        return { success: false, error: 'No OpenAI API key configured. Add it in Settings → Transcription.' };
      }
      if (typeof sdp !== 'string' || !sdp) {
        return { success: false, error: 'Missing SDP offer' };
      }

      const model = (sessionConfig && typeof sessionConfig.model === 'string')
        ? sessionConfig.model
        : 'gpt-4o-realtime-preview';
      const voice = (sessionConfig && typeof sessionConfig.audio?.output?.voice === 'string')
        ? sessionConfig.audio.output.voice
        : 'echo';

      // Step 1: Create ephemeral session token via POST /v1/realtime/sessions
      let ephemeralToken = null;
      try {
        // Include instructions, tools, and tool_choice if provided so the
        // session is fully configured before the WebRTC call is established.
        const sessionPayload = {
          model,
          voice,
          modalities: ['audio', 'text'],
        };
        if (sessionConfig?.instructions) {
          Object.assign(sessionPayload, { instructions: sessionConfig.instructions });
        }
        if (Array.isArray(sessionConfig?.tools) && sessionConfig.tools.length > 0) {
          Object.assign(sessionPayload, { tools: sessionConfig.tools, tool_choice: sessionConfig.tool_choice ?? 'auto' });
        }
        const sessionBody = JSON.stringify(sessionPayload);
        const sessionResp = await globalThis.fetch('https://api.openai.com/v1/realtime/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: sessionBody,
        });
        if (sessionResp.ok) {
          const sessionData = await sessionResp.json();
          ephemeralToken = sessionData?.client_secret?.value ?? null;
          console.log('[Realtime IPC] Ephemeral token created for model:', model);
        } else {
          const errText = await sessionResp.text().catch(() => `HTTP ${sessionResp.status}`);
          console.warn('[Realtime IPC] Session creation failed:', errText);
        }
      } catch (e) {
        console.warn('[Realtime IPC] Session creation error:', e?.message);
      }

      // Fall back to using the raw API key if ephemeral token creation fails
      const authToken = ephemeralToken ?? apiKey;

      // Step 2: SDP exchange — POST /v1/realtime?model={model} with SDP as body
      const sdpUrl = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
      const response = await globalThis.fetch(sdpUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/sdp',
        },
        body: sdp,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => `HTTP ${response.status}`);
        console.error('[Realtime IPC] exchange-sdp failed:', errText);
        return { success: false, error: `Connection failed (${response.status}): ${errText}` };
      }

      const answerSdp = await response.text();
      return { success: true, sdp: answerSdp };
    } catch (err) {
      console.error('[Realtime IPC] exchange-sdp error:', err);
      return { success: false, error: err.message };
    }
  });

  // ─────────────────────────────────────────────────────
  // realtime:execute-tool
  // Executes a named tool from the Realtime AI model's
  // function_call_arguments.done event.
  // Returns { success, output } where output is a JSON string
  // suitable for conversation.item.create function_call_output.
  // ─────────────────────────────────────────────────────
  ipcMain.handle('realtime:execute-tool', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const name = typeof params?.name === 'string' ? params.name : '';
    const args = (params?.args && typeof params.args === 'object') ? params.args : {};
    if (!name) {
      return { success: false, error: 'Invalid tool name' };
    }

    try {
      if (name === 'get_library_info') {
        return _toolGetLibraryInfo(database, args);
      }
      if (name === 'list_recent_resources') {
        return _toolListRecentResources(database, args);
      }
      if (name === 'search_resources') {
        return _toolSearchResources(database, args);
      }
      if (name === 'open_resource') {
        return _toolOpenResource(database, windowManager, args);
      }
      if (name === 'navigate_dome_ui') {
        return _toolNavigateDomeUI(windowManager, args);
      }
      if (name === 'create_note') {
        return _toolCreateNote(database, windowManager, args);
      }
      return { success: false, error: `Unknown tool: ${name}` };
    } catch (err) {
      console.error(`[Realtime IPC] execute-tool "${name}" error:`, err);
      return { success: false, error: err.message };
    }
  });
}

// ── Tool implementations ────────────────────────────────

function _toolGetLibraryInfo(database, args) {
  const queries = database.getQueries();
  const projects = queries.getProjects.all();
  const folderId = typeof args.folder_id === 'string' ? args.folder_id : null;

  let resources = [];
  if (folderId) {
    try {
      resources = queries.getResourcesByProject?.all(folderId) ?? [];
    } catch { /* query may not exist */ }
  }

  return {
    success: true,
    output: JSON.stringify({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
      })),
      ...(folderId ? { resources: resources.slice(0, 30) } : {}),
    }),
  };
}

function _toolSearchResources(database, args) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) {
    return { success: true, output: JSON.stringify({ count: 0, results: [] }) };
  }

  // Sanitize query for FTS5 (same approach as ai-tools-handler.cjs)
  const safeQuery = query
    .replace(/["'*():.{}[\]^~-]/g, ' ')
    .replace(/\b(AND|OR|NOT)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = safeQuery.split(/\s+/).filter((w) => w.length >= 2);

  if (words.length === 0) {
    return { success: true, output: JSON.stringify({ count: 0, results: [] }) };
  }

  const ftsQuery = words.map((w) => `${w}*`).join(' ');
  const limit = Math.min(Number(args.limit) || 8, 20);

  try {
    const db = database.getDB();
    const rows = db.prepare(
      `SELECT r.id, r.title, r.type, r.project_id, r.updated_at,
              snippet(resources_fts, 2, '**', '**', '…', 20) AS snippet
       FROM resources_fts
       JOIN resources r ON r.id = resources_fts.resource_id
       WHERE resources_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    ).all(ftsQuery, limit);
    return {
      success: true,
      output: JSON.stringify({ count: rows.length, results: rows }),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function _toolOpenResource(database, windowManager, args) {
  const resourceId = typeof args.resource_id === 'string' ? args.resource_id.trim() : '';
  if (!resourceId) {
    return { success: false, error: 'resource_id is required' };
  }
  const queries = database.getQueries();
  const r = queries.getResourceById.get(resourceId);
  if (!r) {
    return { success: false, error: 'Resource not found' };
  }
  const mainWin = windowManager.get('main');
  if (mainWin && !mainWin.isDestroyed()) {
    if (!mainWin.isVisible()) mainWin.show();
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
    mainWin.webContents.send('dome:open-resource-in-tab', {
      resourceId: r.id,
      resourceType: r.type,
      title: r.title || 'Resource',
    });
  }
  return { success: true, output: JSON.stringify({ opened: r.id, title: r.title, type: r.type }) };
}

const NAVIGABLE_VIEWS = new Set([
  'home',
  'settings',
  'calendar',
  'agents',
  'studio',
  'flashcards',
  'learn',
  'tags',
  'marketplace',
]);

function _toolNavigateDomeUI(windowManager, args) {
  const view = typeof args.view === 'string' ? args.view.trim().toLowerCase() : '';
  if (!NAVIGABLE_VIEWS.has(view)) {
    return {
      success: false,
      error: `Invalid view "${view}". Use one of: ${[...NAVIGABLE_VIEWS].join(', ')}`,
    };
  }
  const mainWin = windowManager.get('main');
  if (mainWin && !mainWin.isDestroyed()) {
    if (!mainWin.isVisible()) mainWin.show();
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
    mainWin.webContents.send('dome:open-singleton-tab', { tab: view });
  }
  return { success: true, output: JSON.stringify({ navigated: view }) };
}

function _toolListRecentResources(database, args) {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
  try {
    const db = database.getDB();
    const rows = db
      .prepare(
        `SELECT id, title, type, project_id, updated_at
         FROM resources
         WHERE type IS NOT NULL AND type != 'folder'
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(limit);
    return {
      success: true,
      output: JSON.stringify({ count: rows.length, resources: rows }),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function _toolCreateNote(database, windowManager, args) {
  const content = typeof args.content === 'string' ? args.content.trim() : '';
  let projectId = typeof args.project_id === 'string' ? args.project_id.trim() : '';
  const titleRaw = typeof args.title === 'string' ? args.title.trim() : '';
  const title =
    titleRaw ||
    (content ? `${content.replace(/\s+/g, ' ').slice(0, 56)}${content.length > 56 ? '…' : ''}` : 'Voice Note');

  if (!content) {
    return { success: false, error: 'Note content is required' };
  }

  try {
    const queries = database.getQueries();
    // Resolve project: use provided id, or fall back to the first available project
    if (!projectId) {
      const projects = queries.getProjects.all();
      projectId = projects[0]?.id ?? 'default';
    }

    const id = require('crypto').randomUUID();
    const now = Date.now();

    // id, project_id, type, title, content, file_path, folder_id, metadata, created_at, updated_at
    queries.createResource.run(id, projectId, 'note', title, content, null, null, null, now, now);

    // Notify the main window to open the new note
    const mainWin = windowManager.get('main');
    if (mainWin && !mainWin.isDestroyed()) {
      if (!mainWin.isVisible()) mainWin.show();
      mainWin.webContents.send('dome:open-resource-in-tab', {
        resourceId: id,
        resourceType: 'note',
        title,
      });
    }

    return {
      success: true,
      output: JSON.stringify({ created: true, id, title }),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { register };
