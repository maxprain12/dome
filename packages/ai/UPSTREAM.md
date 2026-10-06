# Vendored pi-ai core

Source: https://github.com/earendil-works/pi/tree/56b25ff4e/packages/ai

The implementation is synchronized to pi commit `56b25ff4e` (pi-ai 1.0.4, 2026-10-06; previous sync `b271b0a524b2`, 2026-10-02). MIT attribution is preserved in `LICENSE.upstream`.

Dome adaptations:
- ESM relative imports use `.js` for TypeScript NodeNext output; the side-effect-free upstream entry is `core.ts`, behind Dome's compatibility entry.
- Dome model/message/usage/schema/Ollama bridges and legacy image-collection exports remain available.
- Generated provider data is included as grouped JSON. It was produced with the pinned generator against public provider catalogs on 2026-10-02; upstream Git does not include this generated data. The manifest records provenance. Catalog refresh is owned by each SDK provider and persisted by the main-process profile collection.
- SDK dependency versions follow the pinned package. Smithy types are aligned with the installed Bedrock SDK. The Codex binary request body is copied to an owned ArrayBuffer for DOM fetch typing.
- Historical deferred-tool metadata remains accepted by the compatibility reader; new contracts use the unified transcript/system-message and compact-frame helpers.
- OAuth HTML writers share a minimal response contract, avoiding full `ServerResponse` identity conflicts when transitive dependencies load multiple Node type versions.

The SDK is Node-only in Dome. The renderer reads sanitized model metadata over validated IPC and never imports provider implementations or receives credentials. Hosted browser services are excluded; AI providers retain their own account requirements.

Selected deterministic upstream suites are preserved in `test/` (runtime/auth/catalogs, frames/events, transcript/tool changes, constrained sampling, validation, image adapters, classification and the faux provider). They run alongside Dome bridge tests; real-provider tests requiring accounts are not included.

## Refreshing the model catalog

`src/providers/data/*.json` is hydrated offline from pi's published catalog (no provider keys needed):

```bash
curl -sS "https://pi.dev/api/models?types=chat,image,classifier" -o /tmp/models.all.json
pnpm --filter @dome/ai run hydrate-model-catalog /tmp/models.all.json
```

The scripts in `scripts/` are pi's, with one Dome tweak: the shard import pattern in `model-data.ts` accepts `.js` as well as `.ts`.

## Azure

Upstream renamed the provider id `azure-openai-responses` to `azure` (the API id is unchanged). Dome keeps the legacy id in settings and UI and maps it at the boundaries: `resolveDomeModel` and the main-process model collection (`electron/ai/model-collection.cjs`).
