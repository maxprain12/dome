// Regenerates .design-sync/app-styles.css = compiled app CSS (dist/assets/index-*.css)
// + light-theme tokens on :root. Run after `pnpm build` on re-sync.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'dist/assets';
const css = readdirSync(dir).filter((f) => /^index-.*\.css$/.test(f)).map((f) => join(dir, f))[0];
if (!css) { console.error('no dist/assets/index-*.css — run pnpm build first'); process.exit(1); }
const dist = readFileSync(css, 'utf8');
const override = readFileSync('.design-sync/tokens/theme-light.css', 'utf8');
const header = `/* design-sync cssEntry (GENERATED). = ${css} + :root light tokens. */\n`;
writeFileSync('.design-sync/app-styles.css', header + dist + '\n\n' + override);
console.log('regenerated .design-sync/app-styles.css from', css);
