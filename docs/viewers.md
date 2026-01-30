# Viewers Feature

Documentation for Dome's resource viewers: PDF, Video, Audio, Image, and URL. Lives in `app/components/viewers/`, with PDF subcomponents and libs for loading/annotations.

---

## Interfaces

### Viewer usage

- **WorkspaceLayout** chooses viewer by `resource.type`: pdf → PDFViewer, video → VideoPlayer, audio → AudioPlayer, image → ImageViewer, url → URLViewer.
- **Resource**: Must have `id`; for binary types often `internal_path` or `file_path`; URL type has `metadata?.url` or `content` (URL string).
- **Data source**: File content via `window.electron.resource.readFile(resourceId)` (Base64 data URL) or URL for URLViewer; PDF may use blob URL from readFile.

### PDFViewer

- **Role**: Render PDF pages; annotations overlay; toolbar (zoom, page nav, annotation tools).
- **Components**: PDFViewer (container), PDFPage (single page canvas), AnnotationLayer (overlay), AnnotationToolbar (tools).
- **Annotations**: Stored as interactions (type 'annotation') with position_data (page, rect, etc.); vector index for semantic search (vector:annotations:*). Load via useInteractions(resourceId, 'annotation').
- **Lib**: `app/lib/pdf/pdf-loader.ts` (load PDF doc from URL/buffer); `app/lib/pdf/annotation-utils.ts` (position/serialization helpers).

### VideoPlayer / AudioPlayer

- **Role**: Play video or audio from resource file. Source = blob URL or data URL from readFile(resourceId).
- **Metadata**: duration, transcription in resource.metadata; optional AI summary.

### ImageViewer

- **Role**: Display image from resource (readFile data URL or blob). Optional zoom/pan.

### URLViewer

- **Role**: Display URL resources: iframe or scraped content; metadata (url_type: article | youtube), scraped_content, screenshot_path.
- **Web processing**: `app/lib/web/processor.ts` or main process web scraper; YouTube may use youtube-service for metadata.

---

## Design patterns

### Loading file content

- **Renderer**: Call `window.electron.resource.readFile(resourceId)` → returns Base64 data URL (e.g. `data:application/pdf;base64,...`). Viewer creates blob URL or uses data URL as src.
- **Lazy load**: Viewers mount when tab/resource is active; load file in useEffect when resourceId is set.

### PDF-specific

- **pdf-loader**: Load PDF.js document from array buffer or URL; expose getPage(pageNumber), numPages.
- **PDFPage**: Renders one page (canvas); zoom from toolbar or props.
- **AnnotationLayer**: Renders annotation shapes (highlights, underlines, etc.) from position_data; may allow creating new annotations (then db.interactions.create with type 'annotation').
- **AnnotationToolbar**: Tools (e.g. highlight, underline); selection → create annotation with position_data.

### Annotations (interactions)

- **Type**: resource_interactions with type 'annotation'.
- **position_data**: JSON with page, rect, selectedText, shape type, etc.
- **Vector**: Optional indexing for semantic search (vector:annotations:index, vector:annotations:search in main).

### Events

- **resource:updated**: Viewers can subscribe to refresh if resource or metadata (e.g. transcription) changes.

---

## Data flow

- **Open resource**: WorkspaceLayout sets resource → viewer receives resourceId → useEffect calls readFile(resourceId) → set src state → render.
- **PDF**: readFile → PDFLoader.load() → get numPages → render PDFPage per page; AnnotationLayer reads interactions for resourceId and filters by page.
- **Create annotation**: User selects text in PDF → toolbar "Add annotation" → build position_data → db.interactions.create({ resourceId, type: 'annotation', content, position_data }) → refresh annotations; optionally vector:annotations:index in main.
- **URL**: URLViewer uses resource.metadata?.url or resource.content; iframe src or rendered scraped_content.

---

## Functionality

- **PDF**: Multi-page view, zoom, page navigation, annotation overlay, create/list annotations, optional vector search.
- **Video**: Playback from resource file; duration/transcription from metadata.
- **Audio**: Playback from resource file; optional transcript display.
- **Image**: Display image; optional zoom/pan.
- **URL**: Display URL in iframe or scraped content; YouTube/article metadata.

---

## Key files

| Path | Role |
|------|------|
| `app/components/viewers/PDFViewer.tsx` | PDF container, pages, toolbar |
| `app/components/viewers/pdf/PDFPage.tsx` | Single page canvas |
| `app/components/viewers/pdf/AnnotationLayer.tsx` | Annotation overlay |
| `app/components/viewers/pdf/AnnotationToolbar.tsx` | Annotation tools |
| `app/components/viewers/VideoPlayer.tsx` | Video element, src from readFile |
| `app/components/viewers/AudioPlayer.tsx` | Audio element, src from readFile |
| `app/components/viewers/ImageViewer.tsx` | Image element, src from readFile |
| `app/components/viewers/URLViewer.tsx` | iframe or scraped content |
| `app/components/viewers/index.ts` | Exports |
| `app/lib/pdf/pdf-loader.ts` | Load PDF document (PDF.js) |
| `app/lib/pdf/annotation-utils.ts` | Annotation position/serialization |
| `app/lib/hooks/useInteractions.ts` | Load interactions by resourceId and type |
| `electron/thumbnail.cjs` | Thumbnail generation (main) |
| `electron/web-scraper.cjs` | Scrape URL content (main) |
| `electron/youtube-service.cjs` | YouTube metadata (main) |
