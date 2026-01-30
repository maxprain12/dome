# Command Center Feature (Cmd+K)

Documentation for Dome's command palette: search (unified FTS), URL add (article/YouTube), file drop/import, and actions. Lives in `app/components/CommandCenter/`, `app/lib/store/useAppStore.ts`, and IPC `db:search:unified`.

---

## Interfaces

### CommandCenter props (`app/components/CommandCenter/CommandCenter.tsx`)

```ts
interface CommandCenterProps {
  onResourceSelect?: (resource: any) => void;
  onCreateNote?: () => void;
  onUpload?: (files: File[]) => void;
  onImportFiles?: (filePaths: string[]) => void;
  onAddUrl?: (url: string, type: 'youtube' | 'article') => void;
}
```

### Search results (`app/lib/store/useAppStore.ts`, SearchResults.tsx)

```ts
// useAppStore
searchQuery: string;
searchResults: { resources: any[]; interactions: any[] } | null;
setSearchQuery: (query: string) => void;
setSearchResults: (data: { resources: any[]; interactions: any[] } | null) => void;

interface SearchResultsProps {
  results: { resources: any[]; interactions: any[] };
  query: string;
  isLoading: boolean;
  onSelect: (resource: any) => void;
}
```

### URL and file rules

- **URL validation**: isValidUrl (URL constructor, http/https). YouTube: isYouTubeUrl (youtube.com/watch, embed, youtu.be, shorts).
- **Allowed file extensions**: pdf, doc, docx, txt, md, images, audio, video, ppt, xls, csv, etc. (ALLOWED_EXTENSIONS).
- **Blocked**: exe, msi, dmg, bat, sh, zip, rar, dll, etc. (BLOCKED_EXTENSIONS).

---

## Design patterns

### Keyboard and focus

- **Open**: Cmd+K (Mac) / Ctrl+K (Windows/Linux) → focus input, setIsExpanded(true).
- **Close**: Escape (when focused or in URL mode) → collapse, clear URL mode and query, blur; or click outside container.
- **URL submit**: In URL mode, Enter with valid URL → handleSubmitUrl → onAddUrl(url, type).

### Modes

- **Search mode**: Default. Input = search query; debounced 300ms → window.electron.db.search.unified(query) → setSearchResults({ resources, interactions }) in useAppStore.
- **URL mode**: Toggle (e.g. link icon or "Add URL"); input shows urlInput (default "https://"); detectedUrlType = youtube | article; Enter submits and calls onAddUrl(url, type).

### Drop zone

- **Show**: When drag-over (e.g. showDropzone true); DropZone component for files and URL/text paste.
- **Files**: Filter by BLOCKED_EXTENSIONS; get paths via window.electron.getPathsForFiles(files) or file.path fallback; onImportFiles(filePaths). Fallback onUpload(files) if no paths.
- **URL/text**: Parse URL from text; if valid, can switch to URL mode or call onAddUrl.

### Search

- **API**: db.search.unified(query) → IPC `db:search:unified` → main runs FTS over resources_fts and interactions_fts; returns { resources, interactions }.
- **Debounce**: 300ms; while query or urlMode changes, clear results when appropriate.
- **Store**: searchQuery and searchResults live in useAppStore so other components can read them; CommandCenter sets them on input change and search response.

### Actions from results

- **onResourceSelect**: When user selects a resource from SearchResults → close palette, navigate or open workspace (parent provides callback).
- **onCreateNote**: "New note" action if provided.
- **onUpload / onImportFiles**: Handled by drop/paste; parent typically calls db.importFile or db.importMultipleFiles and refreshes list.
- **onAddUrl**: Create URL resource (parent creates resource + optional scrape); type youtube | article.

---

## Data flow

- **Type in search**: setQuery → debounce → db.search.unified(query) → setSearchResults → SearchResults renders resources + interactions; highlightMatch(query).
- **Switch to URL**: setUrlMode(true), setUrlInput('https://') → user types URL → Enter → onAddUrl(url, type) → parent creates resource.
- **Drop files**: getPathsForFiles → onImportFiles(filePaths) → parent imports via IPC and refreshes.
- **Select result**: onResourceSelect(resource) → parent opens workspace or navigates.

---

## Functionality

- **Unified search**: Full-text over resources (title, content) and interactions (content, selectedText); results grouped as resources and interactions; click to open resource.
- **Add URL**: Toggle URL mode, enter URL, submit as youtube or article; onAddUrl creates resource (and optionally triggers scrape).
- **Drop/paste**: Accept file drop and optional URL/text paste; filter blocked types; pass file paths to onImportFiles.
- **Create note**: Optional onCreateNote from palette action.
- **Placeholder rotation**: Placeholder text rotates every 3s from PLACEHOLDER_SUGGESTIONS.
- **Accessibility**: Focus trap, Escape to close, keyboard nav in results (if implemented).

---

## Key files

| Path | Role |
|------|------|
| `app/components/CommandCenter/CommandCenter.tsx` | State (query, urlMode, urlInput, isExpanded, isSearching, showDropzone); Cmd+K; debounced search; URL submit; drop handler; SearchResults and DropZone |
| `app/components/CommandCenter/SearchResults.tsx` | Renders resources + interactions; icons by type; highlightMatch; onSelect |
| `app/components/CommandCenter/DropZone.tsx` | Drag-over UI; accept files/URL; callbacks |
| `app/components/CommandCenter/index.ts` | Exports |
| `app/lib/store/useAppStore.ts` | searchQuery, searchResults, setSearchQuery, setSearchResults |
| `electron/database.cjs` | FTS queries for unified search (resources_fts, interactions_fts) |
| `electron/main.cjs` | IPC handler db:search:unified |
| `electron/preload.cjs` | window.electron.db.search.unified, getPathsForFiles |
