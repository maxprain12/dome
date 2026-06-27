# `@dome/prompts` — changelog

## minimax-v2 (2026-06-27)

- Removed `prompts/martin/`; core → `sections/`, surfaces → `surfaces/`, tool docs → `@dome/tools/src/domains/`.
- Migrated **editor**, **studio**, **kb-wiki** from `prompts/` to `packages/prompts/surfaces/`.
- Generated tools index: `sections/tools-index.txt`.
- Audited domain prompts; fixed flashcard schema (`question`/`answer`).
- `dome_load_doc` manifest: 14 ids (`email_tool`, `github_tool` added).

## minimax-v1 (2026-06-01)

- MiniMax M-series sections; unified assembler in `shared/prompt-assembler/`.
- Volatile session context via indexed `Source` + trailing `Task`.
