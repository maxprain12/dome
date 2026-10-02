import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

async function files(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(filename);
    return entry.isFile() && filename.endsWith('.cjs') ? [filename] : [];
  }));
  return nested.flat();
}

let failed = false;
const sources = (await Promise.all(['electron', 'scripts'].map(files))).flat();
for (const filename of sources) {
  try {
    const source = (await fs.readFile(filename, 'utf8')).replace(/^#![^\n]*\n/, '\n');
    vm.compileFunction(source, ['exports', 'require', 'module', '__filename', '__dirname'], { filename });
  } catch (error) {
    console.error(`${filename}: ${error.message}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log(`Main-process syntax passed (${sources.length} CommonJS files).`);
