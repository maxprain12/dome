---
name: organizing-documents
description: "Reorganize the library with resource_get_library_overview, folders, and moves."
when_to_use: "User asks to organize documents, clean up the library, or group files into folders."
allowed-tools:
  - resource_get_library_overview
  - resource_create
  - resource_move_to_folder
  - resource_update
---

## Organizing documents (step-by-step)

When the user says "organize my documents", "organize these", "organize all", or similar:

1. Call `resource_get_library_overview` to see their current structure (folders, resources, where each item is).
2. Propose a logical folder structure based on themes, projects, or dates.
3. Use `resource_create` (`type: folder`) to create new folders if needed. Add `metadata: { color: "#hex" }` for folder color. Valid colors: #7B76D0, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6, #ec4899, #6b7280, #14b8a6.
4. Use `resource_move_to_folder` to move resources into the right folders.
5. If the user asks to change folder colors: use `resource_update` with `metadata: { color: "#hex" }` for each folder. Assign distinct colors by theme (e.g. work=#3b82f6, personal=#22c55e, archive=#6b7280).

When listing folders for the user, use clickable links: `[Abrir carpeta: Title](dome://folder/FOLDER_ID)`.
