'use strict';
/* eslint-disable no-console */
/**
 * PptxGenJS Script Runner (CJS)
 *
 * Usage:
 *   echo "<pptxgenjs script>" | node run_ppt_script_node.cjs <output_path>
 *
 * The script must produce a .pptx file at process.env.PPTX_OUTPUT_PATH.
 * Supports `await` via AsyncFunction — no need to wrap in async IIFE.
 *
 * Patches PptxGenJS.prototype.writeFile to capture unresolved async promises
 * so the runner waits for the file even if the script omits `await`.
 *
 * Outputs JSON to stdout: { success: boolean, path?: string, error?: string }
 */

const path = require('path');
const fs = require('fs');

function output(result) {
  process.stdout.write(JSON.stringify(result) + '\n');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    output({ success: false, error: 'Missing output path argument' });
    process.exit(1);
  }

  const resolvedOutputPath = path.resolve(outputPath);
  // Expose to the user script via env
  process.env.PPTX_OUTPUT_PATH = resolvedOutputPath;

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

  // Patch PptxGenJS.prototype.writeFile to capture async promises so we can
  // await them even if the user script doesn't use `await`.
  const pendingWrites = [];
  try {
    const PptxGenJS = require('pptxgenjs');
    const origWriteFile = PptxGenJS.prototype.writeFile;
    PptxGenJS.prototype.writeFile = function (...args) {
      const promise = origWriteFile.apply(this, args);
      if (promise && typeof promise.then === 'function') {
        pendingWrites.push(promise.catch(() => {}));
      }
      return promise;
    };
  } catch (_e) {
    // pptxgenjs unavailable — the script will fail naturally with a useful error
  }

  try {
    // AsyncFunction allows `await` inside the user script body
    // eslint-disable-next-line no-new-func
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      'require',
      'process',
      'console',
      '__dirname',
      '__filename',
      scriptCode,
    );
    await fn(
      require,
      process,
      console,
      path.dirname(resolvedOutputPath),
      resolvedOutputPath,
    );

    // Wait for any writeFile promises that were not explicitly awaited
    if (pendingWrites.length > 0) {
      await Promise.all(pendingWrites);
    }
  } catch (e) {
    output({ success: false, error: e.message || String(e) });
    process.exit(1);
  }

  if (!fs.existsSync(resolvedOutputPath)) {
    output({
      success: false,
      error:
        'Script completed but output file was not created. ' +
        'Make sure to call: await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })',
    });
    process.exit(1);
  }

  output({ success: true, path: resolvedOutputPath });
}

main().catch((e) => {
  output({ success: false, error: e.message || String(e) });
  process.exit(1);
});
