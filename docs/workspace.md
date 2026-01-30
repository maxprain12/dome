# Workspace Feature

Documentation for Dome's resource workspace: layout, tabs (Notes, Annotations, AI Chat, Metadata), routing, and viewers. Lives in `app/workspace/`, `app/components/workspace/`, and dynamic viewer imports.

---

## Interfaces

### WorkspaceLayout (`app/components/workspace/WorkspaceLayout.tsx`)

```ts
interface WorkspaceLayoutProps {
  resourceId: string;
}

// State: resource, isLoading, error, sidePanelOpen, showMetadata
// Loads resource via window.electron.db.resources.getById(resourceId)
// Subscribes to resource:updated for current resourceId
```

### Tabs

- **NotesTab**: Notes for the resource (interactions type 'note'); editor or list.
- **AnnotationsTab**: Annotations (interactions type 'annotation'); list + PDF position data.
- **AIChatTab**: Chat with Many for this resource; uses useInteractions(resourceId), getMartinSystemPrompt({ resourceContext }), chatWithTools / chatStream.
- **MetadataModal**: Modal to view/edit resource metadata (title, type, metadata fields); save via db.resources.update.

### Routing

- **Generic**: `app/workspace/[[...params]]/` — client resolves params to resourceId and renders WorkspaceLayout(resourceId).
- **Note**: `app/workspace/note/[[...params]]/` — note-specific workspace (same layout, resource type note).
- **URL**: `app/workspace/url/[[...params]]/` — URL resource workspace (same layout, resource type url).
- Each route has `page.tsx`, `client.tsx`, `wrapper.tsx`; wrapper loads resource and renders WorkspaceLayout or redirects.

---

## Design patterns

### Layout structure

- **WorkspaceLayout**: Header (WorkspaceHeader: title, back, metadata button, panel toggle) + main area + optional SidePanel (tabs: Notes, Annotations, AI Chat).
- **Main area**: Renders viewer by resource.type — PDFViewer, VideoPlayer, AudioPlayer, ImageViewer, or URLViewer (and for note, Editor/NotionEditor in main or in Notes tab).
- **Dynamic imports**: PDFViewer, VideoPlayer, AudioPlayer, ImageViewer loaded with `dynamic(..., { ssr: false })` to avoid SSR/Node issues.

### Resource loading

- Single source: `getById(resourceId)` in useEffect; set resource / error / loading.
- Updates: `window.electron.on('resource:updated', ({ id, updates }) => ...)`; if id === resourceId, merge updates into local state.

### Side panel tabs

- **NotesTab**: Load/save interactions with type 'note'; rich text or list UI.
- **AnnotationsTab**: Load interactions type 'annotation'; display position_data (e.g. page, rect) and content; link to PDF viewer position if applicable.
- **AIChatTab**: See docs/ai-chat.md; context is current resource (title, type, content, summary, transcription).

### Metadata

- **WorkspaceHeader**: Button opens MetadataModal.
- **MetadataModal**: Form for title, type, and metadata (duration, page_count, url, transcription, summary, etc.); on save calls db.resources.update(resourceId, updates).

### Window

- Workspace can run in a separate BrowserWindow (window-manager: open-workspace with resourceId); client receives resourceId from route or window args.

---

## Data flow

- **Open workspace**: User clicks resource → navigate to `/workspace/{resourceId}` or open workspace window with resourceId → wrapper/client loads resource → WorkspaceLayout(resourceId) mounts → load resource, render viewer + side panel.
- **Switch resource**: Navigate to different resourceId → same layout remounts with new id → load new resource, new viewer.
- **Resource update**: Main process or another window updates resource → main emits resource:updated → WorkspaceLayout merges updates; MetadataModal save → db.resources.update → emit resource:updated.

---

## Functionality

- **Single-resource workspace**: One resourceId per layout; viewer by type (PDF, video, audio, image, URL, note).
- **Notes**: Create/edit/delete notes (interactions type 'note') for the resource.
- **Annotations**: List and jump to annotations (with position_data) for the resource.
- **AI Chat**: Many chat with resource context and optional tools (see ai-chat.md).
- **Metadata**: View and edit resource fields and metadata in modal.
- **Back/close**: Header back button closes window or navigates back depending on context.
- **Panel toggle**: Show/hide side panel (Notes / Annotations / AI Chat).

---

## Key files

| Path | Role |
|------|------|
| `app/workspace/[[...params]]/page.tsx` | Route page |
| `app/workspace/[[...params]]/client.tsx` | Client component; resolves resourceId, renders WorkspaceLayout |
| `app/workspace/[[...params]]/wrapper.tsx` | Wrapper for loading/redirect |
| `app/workspace/note/[[...params]]/` | Note workspace route (same pattern) |
| `app/workspace/url/[[...params]]/` | URL workspace route (same pattern) |
| `app/components/workspace/WorkspaceLayout.tsx` | Layout: header, viewer, side panel, metadata modal; resource load and resource:updated |
| `app/components/workspace/WorkspaceHeader.tsx` | Title, back, metadata button, panel toggle |
| `app/components/workspace/SidePanel.tsx` | Tabs: Notes, Annotations, AI Chat; renders NotesTab, AnnotationsTab, AIChatTab |
| `app/components/workspace/NotesTab.tsx` | Notes (interactions type 'note') |
| `app/components/workspace/AnnotationsTab.tsx` | Annotations list and position_data |
| `app/components/workspace/AIChatTab.tsx` | Many chat tab (see ai-chat.md) |
| `app/components/workspace/MetadataModal.tsx` | Metadata form and save |
| `app/components/workspace/index.ts` | Exports |
