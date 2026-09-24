import { capture } from './exec.mjs';

export function preflightGit(version) {
  const dirty = capture('git', ['status', '--porcelain']);
  if (dirty) throw new Error('El árbol de trabajo no está limpio. Haz commit o descarta los cambios antes de compilar.');
  const tag = `v${version}`;
  let headTag = '';
  try {
    headTag = capture('git', ['describe', '--exact-match', '--tags', 'HEAD']);
  } catch {
    throw new Error(`HEAD no está en el tag ${tag}. Haz git checkout ${tag}.`);
  }
  if (headTag !== tag) throw new Error(`HEAD está en ${headTag}, se esperaba ${tag}.`);
  capture('git', ['fetch', 'origin', 'tag', tag, '--force']);
  const local = capture('git', ['rev-parse', 'HEAD']);
  const remote = capture('git', ['rev-list', '-n', '1', tag]);
  if (local !== remote) throw new Error(`El tag ${tag} local (${local}) no coincide con origin (${remote}).`);
  return { tag, commit: local };
}
