#!/usr/bin/env node
/**
 * Smoke test: @langchain/node-vfs (no API keys, no deepagents LLM).
 * Run: node scripts/langchain-vfs-smoke.cjs
 */
const { VfsSandbox } = require('@langchain/node-vfs');

(async () => {
  const sandbox = await VfsSandbox.create({
    initialFiles: { '/src/hello.js': "console.log('vfs-ok')" },
    timeout: 15_000,
  });
  try {
    const r = await sandbox.execute('node /src/hello.js');
    if (r.exitCode !== 0) {
      console.error('Unexpected exit', r);
      process.exit(1);
    }
    if (!String(r.output || '').includes('vfs-ok')) {
      console.error('Unexpected output', r);
      process.exit(1);
    }
    console.log('langchain-vfs-smoke: OK', { exitCode: r.exitCode, truncated: r.truncated });
  } finally {
    await sandbox.stop();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
