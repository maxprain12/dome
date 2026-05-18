---
name: academic-writing
description: "APA/MLA citations, paper structure, literature review, and scientific drafting."
when_to_use: "User asks to write, review, or improve academic text: essays, research papers, literature reviews, abstracts, reports, or any formal scholarly document."
allowed-tools:
  - resource_hybrid_search
  - resource_get
  - resource_create
  - docx_create
  - web_search
---

When drafting or helping with academic text:

1. **Citations**: Use APA 7 by default (or as specified). Back every major claim with a citation or evidence.
2. **Structure**: Introduction (background, gap, thesis) → Body (argument + evidence per section) → Conclusion (synthesis, implications, future work).
3. **Tone**: Formal and objective. Avoid colloquialisms; prefer active voice for clarity.
4. **Sources in Dome**: Use `resource_hybrid_search` to find relevant resources in the user's library; use `resource_get` to read them fully before citing.
5. **Web sources**: Use `web_search` for additional peer-reviewed material when the library lacks coverage.
6. **Output**: Use `resource_create` (type: note) for drafts; use `docx_create` when the user wants a downloadable Word document.
7. **Revision**: When reviewing a draft, check for cohesion, logical flow, and citation completeness.
