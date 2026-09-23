---
title: CMS body translation and note editor reliability
status: active
---

## Scope
Make CMS translation update the full entry body while retaining image references. Improve the shared Tiptap note editor with deliberate AI actions, clearer state feedback, accessible focus, and responsive spacing. Remove unused note workspace styles.

## Implementation
- Require translated prose in generated CMS bodies; retry a copied or image-damaging result once and stop without changing entries if it remains invalid.
- Offer improve, summarize, and translate actions on selected text only. Show an editable preview and require explicit application; reject a suggestion if the note changed meanwhile.
- Guard note saves against external vault edits and retain the local draft on conflict.
- Remove the blank CMS editor loading state, unused note CSS and uncalled editor prompts; clarify save status, add focus indicators and reduced-motion-aware state animation.

## Validation
- Focused tests cover copied-body retries, media preservation, selection-only AI changes, and concurrent note edits.
- Run repository validation gates and inspect the final diff before PR.
