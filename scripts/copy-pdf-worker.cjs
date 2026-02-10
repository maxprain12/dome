#!/usr/bin/env node
/**
 * Copy pdfjs-dist legacy worker to public/ so the renderer can load it.
 * Must match the legacy build used in app/lib/pdf/pdf-loader.ts.
 * Run after install so public/pdf.worker.min.mjs matches the installed pdfjs-dist version.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
const dest = path.join(root, 'public', 'pdf.worker.min.mjs');

if (!fs.existsSync(src)) {
  console.warn('[copy-pdf-worker] pdfjs-dist legacy worker not found at', src);
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-pdf-worker] Copied legacy pdf.worker.min.mjs to public/');
