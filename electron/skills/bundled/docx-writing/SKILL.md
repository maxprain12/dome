---
name: docx-writing
description: "Create, read, and update Word (.docx) documents in the Dome library using docx_create and docx_update."
when_to_use: "User asks to create or edit a Word document, report, brief, memo, or any file they want to download as .docx."
allowed-tools:
  - docx_create
  - docx_get
  - docx_update
  - docx_delete
  - resource_hybrid_search
  - resource_get
---

When working with Word documents:

1. **Decide format**: Use `docx_create` when the user explicitly wants a .docx file (downloadable, sendable). For plain notes, use `resource_create` (type: note) instead.
2. **Content input**: Pass `markdown` (preferred for rich content), `html`, `blocks` (structured paragraphs + headings), or `body` (plain text with `\n\n` paragraph breaks).
3. **Read before editing**: Call `docx_get` to read the current content before calling `docx_update`. Use `format: "text"` for reading, `format: "html"` if you need to preserve structure.
4. **Update**: Call `docx_update` with the modified content. It replaces the full document — always include the complete new content, not just the diff.
5. **Gather source material**: Use `resource_hybrid_search` + `resource_get` to pull relevant library resources into the document before writing.
6. **Delete**: Call `docx_delete` only after explicit user confirmation; set `confirm: true`.
