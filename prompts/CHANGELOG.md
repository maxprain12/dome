# Prompt changelog

## minimax-v1 (2026-06-01)

- Restructured system prompts to MiniMax M-series sections (Role, Context, Constraints, ToolUse, OutputFormat, Reference, Source, Task).
- Split monolithic `martin/tools.txt` into `martin/core/*`; `tools.txt` is now a generated index.
- Unified assembler in `shared/prompt-assembler/` (renderer + main process).
- Volatile session context uses indexed `Source` + trailing `Task` (Many panel).
- `dome_load_doc` JSON enum aligned to all 12 reference doc IDs.
- Bench manifest/summary includes `promptVersion`; new meta regression cases for format and feeders stub.
- Expanded subagent, team supervisor, studio, and editor prompts with explicit contracts.

**Bench cases improved:** `meta/dome_load_doc`, new `meta/reference_stub_feeders`, `meta/prompt_format_no_raw_json`.
