# Security Vulnerabilities — Deferred

The following CVEs cannot be auto-remediated due to frozen package constraints.
Manual review required before bumping.

| Package | CVE | Severity | Notes |
|---------|-----|----------|-------|
| `electron` (<=39.8.4) | GHSA-vmqv-hx8q-j7mg and 14 others | HIGH | Multiple CVEs — requires major bump to 41.x. Frozen. |
| `electron-builder` (<=26.5.0) | Multiple | HIGH | Fixed via major bump to 26.8.1. Frozen. |
| `app-builder-lib` (<=26.5.0) | Multiple | HIGH | Transitive of electron-builder. Frozen. |
| `cacache` (<=18.0.4) | GHSA-29hm-vx82-ff92 | HIGH | Transitive of electron-builder via node-gyp. Frozen. |
| `dmg-builder` (<=26.5.0) | Multiple | HIGH | Transitive of electron-builder. Frozen. |
| `make-fetch-happen` (<=14.0.0) | GHSA-3jhj-64xh-84pp | HIGH | Transitive of electron-builder via node-gyp. Frozen. |
| `node-gyp` (<=10.3.1) | GHSA-2h3h-px79-wr4w | HIGH | Transitive of electron-builder. Frozen. |
| `electron-builder-squirrel-windows` (<=26.5.0) | Multiple | HIGH | Transitive of electron-builder. Frozen. |
| `protobufjs` (transitive) | GHSA-xq3m-2v4x-88gg | CRITICAL | Required by `@langchain/community` and other LangChain deps. Frozen. |
| `@whiskeysockets/baileys` | Unknown | CRITICAL | Direct dep WA protocol library. No safe downgrade path. Review manually. |
| `@whiskeysockets/libsignal-node` | Unknown | CRITICAL | Transitive of baileys. No safe downgrade path. Review manually. |
| `xlsx` (SheetJS) | GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 | HIGH | No fix available upstream. Used in `electron/excel-tools-handler.cjs` and `electron/document-extractor.cjs`. |
| `node-tar` (transitive) | GHSA-34x7-hfp2-rc4v | HIGH | Deeply nested in `electron-builder`, `node-gyp`. Frozen. |
| `lodash`, `lodash-es` | GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh | HIGH | Transitive through `@chevrotain/*`. No safe upgrade path without breaking LangChain. Frozen. |
| `path-to-regexp` | GHSA-j3q9-mxjg-w52f | HIGH | Transitive through `react-router-dom`. Frozen. |
| `picomatch` | GHSA-3v7f-55p6-f55p | HIGH | Transitive through `glob` → `electron-builder`. Frozen. |

## Audit Summary (2026-04-22)

- **Frozen packages deferred**: electron, xlsx, node-tar, lodash, path-to-regexp, picomatch, protobufjs, @electron/rebuild, app-builder-lib, cacache, dmg-builder, make-fetch-happen, node-gyp, electron-builder, libsignal, @whiskeysockets/baileys
- **Auto-remediated (2026-04-22)**: @xmldom/xmldom@0.8.13, axios@1.15.2, dompurify@3.4.1, langchain@1.3.4, @huggingface/transformers@4.2.0, @napi-rs/canvas@0.1.99, @tiptap/* (39 packages), @electron/rebuild@4.0.4, @hono/node-server@1.19.14, @langchain/anthropic@1.3.27, @langchain/core@1.1.41, @langchain/google-genai@2.1.28, playwright@1.59.1, posthog-js@1.370.1, react-router-dom@7.14.2, tar@7.5.13, typescript-eslint@8.59.0, yauzl@3.3.0
- **Semver bumps applied**: @tiptap/* (39 packages), @electron/rebuild, @hono/node-server, @langchain/*, axios, dompurify, langchain, playwright, posthog-js, react-router-dom, tar, typescript-eslint, yauzl, @xmldom/xmldom

## Audit Summary (2026-04-17)

- **Frozen packages deferred**: electron, xlsx, node-tar, lodash, path-to-regexp, picomatch, protobufjs
- **Auto-remediated**: 7 LangChain patches (@langchain/anthropic, @langchain/core, @langchain/google-genai, @langchain/langgraph, @langchain/openai), better-sqlite3@12.9.0
- **Semver bumps applied**: @tiptap/* (31 packages), @sinclair/typebox, @tabler/icons-react, autoprefixer, diff, i18next, jotai, marked, mermaid, pdfjs-dist, postcss, posthog-js, react-clear-modal, react-i18next, react-router-dom, tailwind-merge, turndown, typescript, wait-on, zustand
- **bun.lock regeneration**: skipped (bun not available on VPS)