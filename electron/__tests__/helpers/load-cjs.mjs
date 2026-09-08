import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Load real domain code with explicit boundary substitutes, without mutating require.cache. */
export function loadCjsModule(filename, replacements) {
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${readFileSync(filename, 'utf8')}\n})`, { filename })(
    (name) => Object.hasOwn(replacements, name) ? replacements[name] : localRequire(name),
    module, module.exports,
  );
  return module.exports;
}
