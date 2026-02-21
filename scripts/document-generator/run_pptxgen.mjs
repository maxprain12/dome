#!/usr/bin/env node
/**
 * Run a PptxGenJS script to generate a .pptx file.
 *
 * Usage:
 *   echo "<script code>" | node run_pptxgen.mjs <output_path>
 *
 * The script must:
 *   - Use: const PptxGenJS = require('pptxgenjs');
 *   - Call pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH });
 *
 * Reads script from stdin, writes to temp file, runs with Node.
 * Outputs JSON to stdout: { success: boolean, path?: string, error?: string }
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TIMEOUT_MS = 60000;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function output(result) {
  console.log(JSON.stringify(result));
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    output({ success: false, error: 'Missing output path argument' });
    process.exit(1);
  }

  let scriptCode;
  try {
    scriptCode = await readStdin();
  } catch (e) {
    output({ success: false, error: `Failed to read stdin: ${e.message}` });
    process.exit(1);
  }

  if (!scriptCode || !scriptCode.trim()) {
    output({ success: false, error: 'Empty script received' });
    process.exit(1);
  }

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `dome_pptxgen_${Date.now()}_${Math.random().toString(36).slice(2)}.cjs`
  );

  try {
    fs.writeFileSync(tmpFile, scriptCode, 'utf8');
  } catch (e) {
    output({ success: false, error: `Failed to write temp file: ${e.message}` });
    process.exit(1);
  }

  const scriptDir = path.resolve(__dirname, '..', '..');
  const nodeModulesPath = path.join(scriptDir, 'node_modules');

  // Prefer system Node so NODE_PATH is respected at startup. When run via Electron,
  // process.execPath runs temp scripts in Electron context which can fail to find pptxgenjs.
  const nodeCmd = process.env.PPTXGEN_NODE || 'node';
  const env = {
    ...process.env,
    PPTX_OUTPUT_PATH: path.resolve(outputPath),
    NODE_PATH: nodeModulesPath,
  };

  return new Promise((resolve) => {
    const proc = spawn(nodeCmd, [tmpFile], {
      cwd: scriptDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (success, errMsg) => {
      if (settled) return;
      settled = true;
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {}

      if (success) {
        output({ success: true, path: outputPath });
      } else {
        output({ success: false, error: errMsg });
      }
      resolve();
    };

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      finish(false, 'Script execution timed out');
    }, TIMEOUT_MS);

    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;

      if (code !== 0) {
        finish(false, stderr || stdout || `Script exited with code ${code}` + (signal ? ` (signal: ${signal})` : ''));
        return;
      }

      if (!fs.existsSync(path.resolve(outputPath))) {
        finish(false, 'Generated file not found. Script must call pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })');
        return;
      }

      finish(true);
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      finish(false, err.message || 'Failed to spawn script');
    });
  });
}

main().catch((err) => {
  output({ success: false, error: err.message || String(err) });
  process.exit(1);
});
