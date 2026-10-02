'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

async function scopedPath(raw, context, writing = false) {
  const cwd = context.workspaceCwd;
  const candidate = path.resolve(cwd || '.', raw);
  const permitted = context.allowedFilePaths || [];
  const real = writing
    ? path.join(await fs.realpath(path.dirname(candidate)), path.basename(candidate))
    : await fs.realpath(candidate);
  const root = cwd ? await fs.realpath(cwd) : null;
  const relative = root ? path.relative(root, real) : '..';
  if (root && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return real;
  for (const selected of permitted) if (await fs.realpath(selected) === real) return real;
  throw new Error('File is outside the authorized workspace or selected files');
}

async function fileAction(name, args, context) {
  const writing = name !== 'browser_read_file';
  const target = await scopedPath(args.path, context, writing);
  if (name === 'browser_read_file') {
    const stat = await fs.stat(target);
    if (stat.size > 400000) throw new Error('File exceeds text read limit');
    return { success: true, path: target, text: await fs.readFile(target, 'utf8') };
  }
  // Existing symlinks must also resolve within the authorized root.
  try { await fs.lstat(target); await scopedPath(target, context); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let text = args.text;
  if (name === 'browser_replace_file') {
    const previous = await fs.readFile(target, 'utf8');
    if (!args.oldText || previous.split(args.oldText).length !== 2) throw new Error('Replacement requires exactly one matching occurrence');
    text = previous.replace(args.oldText, args.text);
  }
  if (Buffer.byteLength(text) > 400000) throw new Error('File exceeds text write limit');
  await fs.writeFile(target, text, 'utf8');
  return { success: true, path: target };
}
module.exports = { scopedPath, fileAction };
