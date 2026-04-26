---
name: ppt-from-folder
description: "Build a real .pptx from documents inside a Dome folder using ppt_create."
when_to_use: "User asks to create a presentation or PPT from files in a folder, or 'presentación con los documentos de [carpeta]'."
paths:
  - "ppt"
allowed-tools:
  - resource_get_library_overview
  - resource_list
  - resource_get
  - ppt_create
---

## PPT from folder / documents

When the user says "create a PPT from documents in folder X" or "presentación con los documentos de [carpeta]":

1. Call `resource_get_library_overview` to find the folder by name and get its ID. Use ONLY folder IDs returned here.
2. Call `resource_list` with `folder_id` to list documents in that folder.
3. For each relevant document (PDF, note): call `resource_get` to fetch content (`include_content: true`, `max_content_length: 50000`).
4. Synthesize the content into slides: title slide, then content slides with key points as bullets. Every slide must have real content from the documents—never empty bullets or placeholders.
5. Call `ppt_create` with `title`, `spec.slides` (built from the content), `project_id`, and `folder_id`. NEVER use `resource_create` for presentations—always `ppt_create`.
6. If `ppt_create` fails due to `folder_id`: retry without `folder_id`. The PPT will be created at project root; inform the user they can move it later.
7. Return the link `[Ver: Title](dome://resource/RESOURCE_ID/ppt)`.
