# Security Vulnerabilities — Deferred

The following CVEs cannot be auto-remediated due to frozen package constraints.
Manual review required before bumping.

| Package | CVE | Severity | Notes |
|---------|-----|----------|-------|
| `electron` (<=39.8.4) | GHSA-vmqv-hx8q-j7mg and 14 others | HIGH | Multiple CVEs — requires major bump to 41.x. Frozen. |
| `protobufjs` (transitive) | GHSA-xq3m-2v4x-88gg | CRITICAL | Required by `@langchain/community` and other LangChain deps. Frozen. |
| `xlsx` ( SheetJS) | GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 | HIGH | No fix available upstream. Used in `electron/excel-tools-handler.cjs` and `electron/document-extractor.cjs`. |
| `node-tar` (transitive) | GHSA-34x7-hfp2-rc4v | HIGH | Deeply nested in `electron-builder`, `node-gyp`. Frozen. |
| `lodash`, `lodash-es` | GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh | HIGH | Transitive through `@chevrotain/*`. No safe upgrade path without breaking LangChain. Frozen. |
| `path-to-regexp` | GHSA-j3q9-mxjg-w52f | HIGH | Transitive through `react-router-dom`. Frozen. |
| `picomatch` | GHSA-3v7f-55p6-f55p | HIGH | Transitive through `glob` → `electron-builder`. Frozen. |

## Audit Summary (2026-04-17)

- **Frozen packages deferred**: electron, xlsx, node-tar, lodash, path-to-regexp, picomatch, protobufjs
- **Auto-remediated**: 7 LangChain patches (@langchain/anthropic, @langchain/core, @langchain/google-genai, @langchain/langgraph, @langchain/openai), better-sqlite3@12.9.0
- **Semver bumps applied**: @tiptap/* (31 packages), @sinclair/typebox, @tabler/icons-react, autoprefixer, diff, i18next, jotai, marked, mermaid, pdfjs-dist, postcss, posthog-js, react-clear-modal, react-i18next, react-router-dom, tailwind-merge, turndown, typescript, wait-on, zustand
- **bun.lock regeneration**: skipped (bun not available on VPS)