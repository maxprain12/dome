/**
 * Patches pptx-preview in node_modules to guard missing slide/layout backgrounds.
 * Keeps a pristine backup at vendor/pptx-preview.es.js.orig (committed once).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function resolveTargetPath() {
  const direct = path.join(root, 'node_modules/pptx-preview/dist/pptx-preview.es.js');
  if (fs.existsSync(direct)) return direct;
  const pnpmDir = path.join(root, 'node_modules/.pnpm');
  const entries = fs.readdirSync(pnpmDir).filter((d) => d.startsWith('pptx-preview@'));
  if (entries.length === 0) throw new Error('pptx-preview package not found — run pnpm install');
  return path.join(pnpmDir, entries[0], 'node_modules/pptx-preview/dist/pptx-preview.es.js');
}

const backupPath = path.join(root, 'vendor/pptx-preview.es.js.orig');
const targetPath = resolveTargetPath();

if (!fs.existsSync(backupPath)) {
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(targetPath, backupPath);
  console.log(`[patch-pptx-preview] Saved pristine backup → ${backupPath}`);
}

const src = fs.readFileSync(backupPath, 'utf8');

const patches = [
  {
    name: 'renderSlide guard',
    from: 'renderSlide=function(t){var e=this.pptx.slides[t],a=document.createElement',
    to: 'renderSlide=function(t){var e=this.pptx.slides[t];if(!e)return;var a=document.createElement',
  },
  {
    name: '_renderBackground guard',
    from:
      'prototype._renderBackground=function(t,e){var a,r=document.createElement("div");r.classList.add("slide-background"),r.style.setProperty("position","absolute"),r.style.setProperty("left","0"),r.style.setProperty("top","0"),r.style.setProperty("width","100%"),r.style.setProperty("height","100%");var n=t.background;if("none"===n.type&&(n=t.slideLayout.background),"none"===n.type&&(n=t.slideMaster.background),"blipFill"===n.type){',
    to:
      'prototype._renderBackground=function(t,e){var a,r=document.createElement("div");r.classList.add("slide-background"),r.style.setProperty("position","absolute"),r.style.setProperty("left","0"),r.style.setProperty("top","0"),r.style.setProperty("width","100%"),r.style.setProperty("height","100%");if(!t){r.style.setProperty("background","#fff"),e.append(r);return}var n=t.background||{type:"none"};if("none"===n.type&&(n=t.slideLayout&&t.slideLayout.background||{type:"none"}),"none"===n.type&&(n=t.slideMaster&&t.slideMaster.background||{type:"none"}),"blipFill"===n.type){',
  },
  {
    name: 'solidFill fallback',
    from: 'var L=S(t.background)||S(t.slideLayout.background)||S(t.slideMaster.background);',
    to: 'var L=S(t.background)||S(t.slideLayout&&t.slideLayout.background)||S(t.slideMaster&&t.slideMaster.background);',
  },
  {
    name: '_renderSlideMaster guard',
    from: 'e.prototype._renderSlideMaster=function(t,e){var a=document.createElement',
    to: 'e.prototype._renderSlideMaster=function(t,e){if(!t)return;var a=document.createElement',
  },
  {
    name: '_renderSlideLayout guard',
    from: 'e.prototype._renderSlideLayout=function(t,e){var a=document.createElement',
    to: 'e.prototype._renderSlideLayout=function(t,e){if(!t)return;var a=document.createElement',
  },
];

let out = src;
for (const patch of patches) {
  if (!out.includes(patch.from)) {
    console.error(`[patch-pptx-preview] Missing anchor for "${patch.name}"`);
    process.exit(1);
  }
  out = out.replace(patch.from, patch.to);
}

const tmp = path.join(root, 'vendor/.pptx-preview-patched-check.es.js');
fs.writeFileSync(tmp, out, 'utf8');
try {
  execSync(`node --check "${tmp}"`, { stdio: 'pipe' });
} catch (err) {
  console.error('[patch-pptx-preview] Patched bundle has invalid syntax:', err.stderr?.toString() || err.message);
  process.exit(1);
} finally {
  fs.unlinkSync(tmp);
}

fs.writeFileSync(targetPath, out, 'utf8');
console.log(`[patch-pptx-preview] Patched ${targetPath} (${out.length} bytes)`);
