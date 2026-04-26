---
name: audit-react
description: React patterns & performance — useEffect cleanup, state mutations, missing deps, oversized components.
version: 2
focus: react
last_updated: 2026-04-26
---

> **Context:** `prompts/shared/project-context.md` (v5), `AGENTS.md` (§ Baseline 2026-04).

## Focus: React Patterns & Performance

Audit the codebase for React anti-patterns that cause bugs and performance issues.

1. `useEffect` with `addEventListener`/`setTimeout`/`setInterval` that has NO cleanup return:
   - Bad: `useEffect(() => { window.addEventListener('x', fn) }, [])`
   - Good: `useEffect(() => { window.addEventListener('x', fn); return () => window.removeEventListener('x', fn) }, [])`

2. Direct state mutations in Zustand stores or React state:
   - Bad: `state.items.push(item)`
   - Good: `set(s => ({ items: [...s.items, item] }))`

3. `useEffect` with missing dependency array (runs on every render):
   - Bad: `useEffect(() => { fetchData() })`
   - Good: `useEffect(() => { fetchData() }, [id])`

4. Components that re-render unnecessarily because they receive new object/array literals as props:
   - Bad: `<Component options={{ key: val }} />`
   - Good: `const options = useMemo(() => ({ key: val }), [val]); <Component options={options} />`

5. Large components over 400 lines that mix data fetching + business logic + rendering.

### Tool use (required before proposing fixes)

- `grep -rn "useEffect" app/components/ | wc -l` — baseline count
- `find app/components -name '*.tsx' -exec wc -l {} \; 2>/dev/null | awk '$1 > 400 {print "   " $1 " lines: " $2}' | sort -rn | head -8` — find the biggest components
- For direct-mutation claims: open the actual call site — don't flag based on a name match alone

### Priority

Fix the `useEffect` cleanup issues first (they cause memory leaks).
For large components: only split if you can identify a clear sub-component boundary.
Do NOT refactor working logic just to reduce line count.
