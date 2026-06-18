/* eslint-disable no-console */
/**
 * Write a Many JSONL session (agent-sessions/--dome--/) for product demos.
 */
const fs = require('fs');
const path = require('path');

const SESSION_CWD = 'dome';

function encodeCwd(cwd) {
  const encoded = cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-');
  return '--' + encoded + '--';
}

function emptyUsage() {
  return {
    input: 1200,
    output: 900,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2100,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.userDataPath
 * @param {string} opts.sessionId
 * @param {string} opts.userText
 * @param {string} opts.assistantText
 * @param {number} opts.now
 */
function seedManyJsonlSession({ userDataPath, sessionId, userText, assistantText, now }) {
  const sessionsDir = path.join(userDataPath, 'agent-sessions', encodeCwd(SESSION_CWD));
  fs.mkdirSync(sessionsDir, { recursive: true });

  if (fs.existsSync(sessionsDir)) {
    for (const name of fs.readdirSync(sessionsDir)) {
      if (name.endsWith(`_${sessionId}.jsonl`)) {
        fs.unlinkSync(path.join(sessionsDir, name));
      }
    }
  }

  const createdAt = new Date(now).toISOString();
  const fileName = `${createdAt.replace(/[:.]/g, '-')}_${sessionId}.jsonl`;
  const filePath = path.join(sessionsDir, fileName);

  const userEntryId = 'dmusr001';
  const asstEntryId = 'dmasst02';

  const header = {
    type: 'session',
    version: 3,
    id: sessionId,
    timestamp: createdAt,
    cwd: SESSION_CWD,
  };

  const userEntry = {
    type: 'message',
    id: userEntryId,
    parentId: null,
    timestamp: createdAt,
    message: {
      role: 'user',
      content: [{ type: 'text', text: userText }],
      timestamp: now,
    },
  };

  const assistantEntry = {
    type: 'message',
    id: asstEntryId,
    parentId: userEntryId,
    timestamp: new Date(now + 1).toISOString(),
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: assistantText }],
      api: 'openai-completions',
      provider: 'minimax',
      model: 'MiniMax-M3',
      usage: emptyUsage(),
      stopReason: 'stop',
      timestamp: now + 1,
    },
  };

  const body = [header, userEntry, assistantEntry].map((line) => JSON.stringify(line)).join('\n') + '\n';
  fs.writeFileSync(filePath, body, 'utf8');
  console.log('[Demo:Seed] Many JSONL session:', filePath);
  return filePath;
}

module.exports = { seedManyJsonlSession };
