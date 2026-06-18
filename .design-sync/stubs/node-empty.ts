// design-sync bundle stub for Node/Electron builtins (browser IIFE has no Node).
// Callable Proxy so transitive `path.join(...)` / `os.homedir()` calls return a
// benign value instead of throwing at render. Only used by the design-sync build.
const noop: any = () => '';
const stub: any = new Proxy(noop, {
  get: (_t, prop) => (prop === '__esModule' ? true : prop === 'default' ? stub : stub),
  apply: () => '',
});
export default stub;
