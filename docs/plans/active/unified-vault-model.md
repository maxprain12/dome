---
title: One resource file model
status: completed
type: refactor
---

# One resource file model

All library resource files live in project vaults and are addressed by project_id
plus vault_path. No runtime resource lookup or writer uses internal_path/file_path.
Picker, content, cloud and generated-document imports share the same service.
Notebook cwd is the containing vault folder, not a second configured directory.

Existing installations migrate their resource files before serving the workspace.
Migration copies and verifies files before clearing obsolete references; failures
remain explicit and retryable, never becoming a silent legacy fallback. External
source files are not deleted. Legacy note conversion belongs to this migration.

Validate migration idempotency, name collisions, missing sources, resource I/O,
all import entry points, notebook cwd and note loading. Run repository checks and
update the existing PR after validation.


Implementation completed:
- Canonical vault-only runtime I/O and resource types; legacy columns removed after
  a verified, recoverable one-way migration.
- One importer for picker/content/cloud/agents/generated documents/recordings.
- Notebook execution directory derived from its resource; removed folder selector.
- Removed the old storage writer/cleanup APIs, placeholder upload API, unused
  page-service stub, 43 unreachable workspace/editor files and obsolete menu CSS.
- Header uses shared dropdown items and keyboard/focus behavior.
- Removed stale sync path/hash caches; edited files produce a new manifest entry.

Local validation passed: 47 backend tests, 12 renderer tests, @dome/db build,
renderer typecheck/build, lint (0 errors; 116 warnings), IPC inventory, Sonar full
and diff checks, dependency-cruiser, and undefined-reference checks on 38 changed
main-process modules. The existing PR includes this follow-up.
