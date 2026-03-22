# Dome

> Intelligent Desktop Application for Knowledge Management and Academic Research

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh/)
[![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.1-00C853?style=flat)](https://langchain-ai.github.io/langgraphjs/)
[![License](https://img.shields.io/badge/License-Custom%20Open%20Source-blue.svg)](LICENSE)

**v2.0.8** — Dome is a comprehensive desktop application designed for researchers, academics, and knowledge workers who need to manage, organize, and synthesize information from multiple sources efficiently. It includes native **Google Drive** import, **Docling**-assisted document conversion before indexing, MCP-powered file import, automatic background indexing, **system tray** with optional **launch at login**, and **multi-language UI** (EN / ES / FR / PT).

---

## Table of Contents

- [Overview](#overview)
- [What's New](#whats-new)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Usage Guide](#usage-guide)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [Releases y CI/CD](#releases-y-cicd)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Overview

Dome provides a unified workspace for managing your research and knowledge. It combines powerful AI capabilities with an intuitive interface, allowing you to:

- **Organize resources** (notes, PDFs, videos, audios, images, URLs, PowerPoints) in projects
- **Agent Canvas** — Visual workflow builder with ReactFlow
- **Agent Teams** — Multi-agent collaboration
- **Marketplace** — Community extensions (agents, plugins, skills, workflows)
- **Many AI Assistant** — Chat with LangGraph-powered agent (web search, resource search, memory, MCP tools)
- **Many Agents** — Create specialized agents with custom instructions, tools, MCP, and icons
- **Studio** — Generate mindmaps, quizzes, flashcards, guides, FAQs, timelines from your content
- **Flashcards** — Spaced repetition (SM-2) with AI-generated decks from your documents
- **Calendar** — Event management with Google Calendar sync and AI-driven event tools
- **Cloud Storage** — Native Google Drive integration with built-in file picker (import to your Dome library)
- **Auto-Indexing** — Background PageIndex sweep on startup and every hour, no manual action needed
- **MCP File Import** — Agents can import files from MCP servers directly into the Dome library
- **Annotate PDFs** with highlights, comments, and notes
- **Notion-style editor** for rich documents
- **PageIndex** — Reasoning-based AI indexing so every resource is ready for semantic search
- **Manage academic sources** and generate citations
- **MCP Integration** — Connect Model Context Protocol servers for extended AI capabilities
- **Plugins** — Extend Dome with pets and custom views
- **Skills** — Agent capabilities from skills.sh ecosystem
- **Guided tours** — Built-in onboarding tours powered by driver.js
- **Web scraping** for offline access
- **WhatsApp** connection for mobile integration

---

## What's New

### v2.0.8 — Cloud Storage, Docling, Tray, i18n, Auto-Indexing & More

- **Google Drive Integration** — Connect your Google Drive account in Settings → Cloud Storage and import files directly into Dome with the built-in file picker. Uses PKCE OAuth 2.0 — no data passes through Dome servers. See [Cloud Storage Setup](docs/cloud-storage-setup.md).
- **Cloud File Picker** — Browse folders, search by name, and multi-select files from Google Drive. Imported files are added to your Dome library and queued for conversion/indexing.
- **Docling Document Pipeline** — PDFs and compatible documents can go through a **Docling** conversion phase (progress shown in the workspace header) before **PageIndex** indexing, for richer text layout and tables where configured.
- **Automatic Background Indexing** — Unindexed resources are processed automatically: once on startup (after a warm-up) and on a recurring schedule, so your library stays AI-ready without manual steps.
- **System Tray & Launch at Login** — Closing the window can keep Dome running in the tray (automations and notifications). Auto-launch can be enabled on first run and toggled later in Settings.
- **Interface Localization** — UI strings use **react-i18next** with **English, Spanish, French, and Portuguese** (language persisted in the app).
- **`import_file_to_dome` Agent Tool** — AI agents can now save files retrieved from any MCP server directly into the Dome library. The tool accepts plain text or base64-encoded binary content (PDF, DOCX, etc.) and triggers indexing automatically.
- **Agent Canvas** — Visual workflow builder with ReactFlow. Create workflows by connecting nodes (text input, agents, documents, outputs, images). Run workflows and see execution logs in real-time.
- **Agent Teams** — Multi-agent collaboration. Create teams of specialized agents that work together in a shared chat session.
- **Marketplace** — Unified marketplace for Agents, Plugins, Skills, and Workflows. Browse, install, and manage extensions from the community.
- **Plugins System** — Extend Dome with custom plugins:
  - **Pets**: Virtual companions that live in your Home and can interact with users
  - **Views**: Custom views integrated into Dome's navigation
- **Skills** — Agent capabilities from the skills.sh ecosystem. Pre-built skills for code review, browser automation, and more.
- **Workflow Library** — Pre-built workflows ready to use (Research & Write, etc.)
- **Image Tools** — AI agents can now crop and resize images (`image_crop`) and generate thumbnails (`image_thumbnail`)
- **PDF Extraction** — Extract text from scanned PDFs using OCR models in Ollama (llava, moondream2, minicpm-v, glm4v)
- **Automations** — Create automation rules that trigger actions based on events
- **Projects Dashboard** — New home screen showing all your projects at a glance
- **Run Engine** — Background engine for running agent workflows
- **GitHub Integration** — Connect GitHub repositories for workflow automation

### v2.0.0 — The Major Update

Dome 2.0 represents a major evolution with the introduction of Agent Canvas, Agent Teams, and a complete Marketplace ecosystem. This release brings visual workflow building, multi-agent collaboration, and community-driven extensions to Dome.

- **PageIndex** — Replaced LanceDB with a reasoning-based document indexing engine. Resources are parsed, chunked, and indexed without embeddings; AI search uses direct reasoning over structured text nodes. Each resource shows an **"Listo para IA"** status badge in the workspace header once indexed.
- **Calendar** — Full calendar view with day/week event management, event creation modal (all-day or timed), and **Google Calendar sync**. AI agents get calendar tools (`create_event`, `update_event`, `delete_event`) so Many can schedule directly from chat.
- **Calendar Settings** — New settings panel to connect and manage Google Calendar accounts.
- **Indexing Settings** — New settings panel to configure the PageIndex service (provider, model, re-index triggers).
- **AI status in header** — The "Listo para IA" badge moved from the editor body to the workspace header bar, next to the Paneles button.
- **Dome Editor** — All Tiptap extensions rewritten as Dome-owned MIT code in `app/lib/dome-editor/`. No longer depends on Docmost's AGPL source.

### v1.4.0 — Analytics

- **PostHog analytics** — Opt-in usage analytics (feature usage, AI tool tracking, error reporting). Toggle in **Settings → Privacy**.

### v1.3.0 — Agent Management & Guided Tours

- **Agent Management** — Edit existing Many Agents (instructions, tools, MCP, icon), import/export agent configurations as JSON.
- **Guided tours** — driver.js-powered onboarding tours highlight key UI areas on first launch.
- **Resource linking** — Improved markdown rendering and cross-resource link resolution.
- **PDF viewer** — Streamlined zoom/navigation controls and better scroll handling.

### v1.2.0 — PowerPoint Support

- **PowerPoint viewer** — Full `.pptx` rendering with slide-by-slide navigation via `pptx-preview`. No LibreOffice dependency.
- **Presentation mode** — Full-screen slide presentation from within Dome.
- **PPT export** — Export presentations to PPTX from the editor.
- **Electron-native slide capture** — Hidden BrowserWindow renders slides for thumbnail generation without external dependencies.

### v1.1.0 — Many Agents & Studio Tools

- **Many Agents** — Create custom agents with personalized instructions, tool selection, MCP integration, and icons; each agent has its own chat sessions.
- **Studio with Tools** — Mindmaps, quizzes, guides, FAQs, timelines, and flashcards now use AI tools (resource search, semantic search) for richer generation from project content.
- **Agent Chat Store** — Per-agent sessions stored in localStorage; switch between agents and sessions in the Home sidebar.
- **Tool Catalog** — 40+ tools grouped by category (web, memory, resources, context, flashcards, studio, audio, research, graph, notebook, excel, calendar).

### v1.0.0

- **LangGraph** — AI chat with tools runs on LangGraph; persistent sessions (SQLite checkpoints)
- **Many** — Assistant panel with sessions, quick prompts, resource + web tools
- **MCP** — Model Context Protocol support; connect stdio/http servers in Settings → MCP
- **Studio** — Generate mindmaps, quizzes, guides, FAQs, timelines, tables, flashcards from projects
- **Flashcards** — SM-2 spaced repetition; AI-generated decks via Many or Studio
- **Vite** — Migrated from Next.js to Vite for faster builds

---

## Features

### Knowledge Hub

Centralized management for all your resources:

| Resource Type | Description |
|---------------|-------------|
| **Notes** | Rich text documents with the Notion-style editor |
| **PDFs** | Academic papers and documents with annotation support |
| **PowerPoints** | `.pptx` files with slide viewer and presentation mode |
| **Videos** | YouTube videos with thumbnail extraction and metadata |
| **Audios** | Audio files with transcription capabilities |
| **Images** | Visual resources with thumbnail generation |
| **URLs** | Web articles with automatic content extraction |
| **Folders** | Hierarchical organization within projects |

### AI Integration

Dome uses **LangGraph** for the chat-with-tools experience and supports multiple AI providers:

**Supported Providers:**
- OpenAI (GPT-4, GPT-4o, etc.)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Opus, etc.)
- Google (Gemini models)
- Ollama (Local models — Llama, Mistral, etc.)
- Venice (Privacy-focused AI)
- Synthetic (Custom providers)

**Many AI Assistant (LangGraph-powered):**
- **Persistent sessions** — Conversations survive app restart (SQLite checkpoints)
- **Streaming chat** with real-time tool execution
- **Built-in tools**: Web search, web fetch, resource search, semantic search, project context
- **Memory tools** — Save and recall information across sessions
- **Flashcard creation** — Generate study decks from documents via chat
- **Calendar tools** — Create, update, and delete calendar events from chat
- **MCP tools** — Use tools from configured Model Context Protocol servers
- **Quick prompts** — Summarize, organize, search your resources in one click

**Many Agents (v1.1.0+):**
- **Custom agents** — Create specialized assistants with custom names, descriptions, and system instructions
- **Tool selection** — Choose which tools each agent can use (web, resources, context, studio, excel, notebook, graph, calendar, etc.)
- **MCP per agent** — Attach MCP servers to specific agents
- **Sessions per agent** — Each agent maintains its own chat history in the sidebar
- **Agent onboarding** — Guided flow: name → instructions → tools → MCP → skills → icon
- **Import / Export** — Share agent configurations as JSON

**Other AI Capabilities:**
- **Semantic Search** — Find resources by meaning (PageIndex reasoning engine)
- **Auto-Transcription** — Convert audio/video to text
- **Document Summarization** — Quick summaries of long documents

### Agent Canvas — Visual Workflow Builder

Build AI workflows visually with an intuitive drag-and-drop interface:

- **Node Types**: Text Input, Agent, Document, Output, Image
- **Visual Editor**: Connect nodes to create complex workflows
- **Execution**: Run workflows and see real-time execution logs
- **Workflow Library**: Pre-built workflows from the marketplace
- **System Agents**: Research, Writer, Library, Data, Curator, Presenter roles

### Agent Teams — Multi-Agent Collaboration

Work with multiple AI agents together in a unified chat:

- **Team Chat**: Collaborate with several agents in the same conversation
- **Role Assignment**: Each agent brings specialized capabilities
- **Shared Context**: All agents access the same project resources
- **Onboarding**: Guided setup for creating agent teams

### Marketplace — Extensions Ecosystem

Discover and install community extensions:

| Extension | Description |
|-----------|-------------|
| **Agents** | Pre-configured AI agents for specific tasks |
| **Plugins** | Local extensions (pets, custom views) |
| **Skills** | Agent capabilities from skills.sh |
| **Workflows** | Ready-to-use visual workflows |

### Plugins System

Extend Dome with custom plugins:

- **Pet Plugins**: Virtual companions that live in your Home, interact with users and Many
- **View Plugins**: Custom pages integrated into Dome's navigation
- **Permissions**: Plugins can request access to resources, settings, calendar, projects

### Skills — Agent Capabilities

Give your agents specialized abilities:

- **Skills.sh Integration**: Browse and install skills from the skills ecosystem
- **Available Skills**: Code review, browser automation, React best practices
- **Per-Agent Skills**: Assign skills to specific agents

### Automations

Create automated workflows based on events:

- **Trigger Rules**: Define conditions that start automations
- **Actions**: Execute tasks automatically
- **Target Selection**: Choose which resources/projects are affected

### Image Tools

AI agents can now manipulate images:

- **Crop**: Crop and resize images with coordinates
- **Thumbnail**: Generate thumbnails for images and PDFs
- **Format Support**: JPEG, PNG, WebP output formats

### PDF Extraction

Extract text from scanned documents:

- **OCR Integration**: Use Ollama vision models (llava, moondream2, minicpm-v, glm4v)
- **Batch Processing**: Extract text from multiple pages
- **Searchable PDFs**: Convert scanned docs to searchable format

### PageIndex — AI-Ready Documents

Resources are indexed using a **reasoning-based** approach (no embeddings required):

- Many PDFs first show **Docling** conversion progress in the header (when applicable), then PageIndex processing
- Documents are parsed into structured text nodes and stored in SQLite
- Each resource shows a status badge: **Listo para IA** (indexed), processing, or error
- The badge appears in the workspace header next to the Paneles button
- Configure the indexing provider and model in **Settings → Indexing**
- Re-index individual resources or the entire project from settings
- Replaces the previous LanceDB embedding pipeline — lighter and more accurate on long documents

### Calendar

Full event management integrated with your research workflow:

- **Calendar view** — Month/day grid with event indicators
- **Event management** — Create, edit, and delete events with all-day or timed options
- **Google Calendar sync** — Connect your Google account in Settings → Calendar
- **AI calendar tools** — Ask Many to schedule meetings, set reminders, or manage events conversationally
- **Notifications** — Event reminders via desktop notifications

### MCP (Model Context Protocol)

Extend Many's capabilities with external MCP servers:

- **Configure servers** in Settings → MCP
- **stdio** — Run local commands (e.g. `npx`, `uvx`) with optional args and env
- **http** — Connect to remote MCP servers via URL
- **Test connection** — Verify servers before using in chat
- Tools from MCP servers are automatically available to Many and individual agents

### Studio

Generate study materials and visualizations from your project sources:

| Output Type | Description |
|-------------|-------------|
| **Mindmap** | Visual concept maps |
| **Quiz** | Interactive quiz from content |
| **Guide** | Structured study guide |
| **FAQ** | Question-answer pairs |
| **Timeline** | Chronological views |
| **Table** | Structured data tables |
| **Flashcards** | AI-generated decks (SM-2 spaced repetition) |

Studio uses AI tools (resource search, PageIndex) to fetch sources before generating, so outputs are grounded in your actual project content.

### Flashcards

Study with spaced repetition:

- **Create decks** manually or ask Many to generate them from your documents
- **SM-2 algorithm** for optimal review scheduling
- **Study sessions** with swipe gestures (known/unknown)
- **Stats** — Cards due, retention, progress per deck
- **Integration** — Decks appear in Studio and link to resources

### PowerPoint Viewer

Full-featured presentation support:

- **Slide viewer** — Rendered via `pptx-preview`, no external dependencies
- **Slide navigation** — Previous/next with keyboard shortcuts
- **Presentation mode** — Full-screen view from the workspace header
- **Export** — Export to PPTX from the workspace
- **Thumbnail generation** — Electron-native slide capture using a hidden BrowserWindow

### PDF Viewer with Annotations

Full-featured PDF viewer with comprehensive annotation tools:

- **Highlight**: Mark important text with custom colors
- **Underline**: Emphasize key passages
- **Strikethrough**: Mark text for revision
- **Comments**: Add notes to specific sections
- **Page Navigation**: Quick jump to any page
- **Zoom Controls**: Fit to width, fit to page, custom zoom

### Notion-Style Editor

Powerful rich text editor built with Tiptap (ProseMirror), using Dome's own extension library (`dome-editor`):

**Block Types:**
- Headings (H1-H6)
- Paragraphs with rich formatting
- Bullet and numbered lists
- Task lists with checkboxes
- Callout blocks with icons
- Toggle blocks (collapsible content)
- Code blocks with syntax highlighting
- Tables with drag-and-drop row/column reordering
- Multi-column layouts (2–5 columns)
- Dividers (line, dots, space)

**Special Blocks:**
- **PDF Embeds**: Embed PDF pages directly in notes
- **File Blocks**: Reference attached files
- **Resource Mentions**: Link to other resources with @mentions
- **Images**: Inline image support

**Features:**
- Slash commands (/) for quick block insertion
- Bubble menu for text formatting
- Drag handles for block reordering
- Search & replace
- Comment marks for inline annotations
- Typography improvements (smart quotes, etc.)

### Guided Tours

- **driver.js** powered step-by-step tours on first launch
- Covers key areas: sidebar, Many panel, Studio, settings
- Can be re-triggered from the Help menu

### YouTube Integration

- Extract video thumbnails in multiple qualities
- Fetch video metadata (title, channel, duration)
- Support for various URL formats (youtube.com, youtu.be, embeds)

### WhatsApp Integration

Connect your WhatsApp for mobile access:

- QR code authentication
- Message handling and routing
- Support for text, audio, image, and document messages
- Real-time connection status

### Web Scraper

Playwright-powered web content extraction:

- Extract article text and metadata
- Capture page screenshots
- Extract Open Graph tags
- Fetch author and publication information
- Download images from pages

### Academic Library

Comprehensive source management for academic work:

**Source Types:**
- Articles, Books, Websites, Videos, Podcasts

**Citation Features:**
- Multiple citation styles (APA, MLA, Chicago, Harvard, Vancouver, IEEE)
- Automatic bibliography generation
- DOI and ISBN support
- Author and publication tracking

### Settings & Customization

| Panel | Description |
|-------|-------------|
| **General** | Profile, auto-save, backup preferences |
| **Appearance** | Light, dark, and system theme modes |
| **AI Configuration** | Providers, API keys, models |
| **Indexing** | PageIndex provider/model, re-index controls |
| **Cloud Storage** | Connect Google Drive for import |
| **Calendar** | Google Calendar account connection and sync |
| **MCP** | Configure Model Context Protocol servers (stdio/http) |
| **Skills** | Browse and manage agent skills |
| **Plugins** | Manage installed plugins and marketplace extensions |
| **Privacy** | PostHog analytics opt-in/out toggle |
| **WhatsApp** | Connection management |

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh/) |
| Desktop Framework | [Electron 32](https://www.electronjs.org/) |
| Frontend | [Vite 7](https://vitejs.dev/) + [React 18](https://reactjs.org/) |
| UI Styling | [Tailwind CSS](https://tailwindcss.com/) |
| UI Components | [Mantine UI](https://mantine.dev/) |
| Visual Workflows | [ReactFlow](https://reactflow.dev/) |
| Rich Text Editor | [Tiptap](https://tiptap.dev/) (ProseMirror) + Dome Editor (MIT) |
| AI Agent | [LangGraph](https://langchain-ai.github.io/langgraphjs/) + [LangChain](https://js.langchain.com/) |
| MCP | [@langchain/mcp-adapters](https://js.langchain.com/docs/integrations/tools/mcp) |
| Relational Database | SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) |
| AI Document Index | PageIndex (reasoning-based, SQLite-backed) |
| State Management | [Zustand](https://github.com/pmndrs/zustand) |
| Language | [TypeScript](https://www.typescriptlang.org/) (strict mode) |
| Routing | [React Router 7](https://reactrouter.com/) |
| i18n | [react-i18next](https://react.i18next.com/) (en, es, fr, pt) |
| Web Automation | [Playwright](https://playwright.dev/) |
| PDF Rendering | [PDF.js](https://mozilla.github.io/pdf.js/) |
| PowerPoint Rendering | [pptx-preview](https://github.com/mesmerize-dev/pptx-preview) |
| Guided Tours | [driver.js](https://driverjs.com/) |
| Analytics | [PostHog](https://posthog.com/) (opt-in) |

---

## Installation

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.0
- [Node.js](https://nodejs.org/) >= 18 (required for Electron)
- macOS, Windows, or Linux

### Steps

1. **Clone the repository**

```bash
git clone https://github.com/maxprain12/dome.git
cd dome
```

2. **Install dependencies**

```bash
bun install
```

3. **Set up environment variables** (optional)

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys:

```bash
# Optional: Default API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

4. **Start in development mode**

```bash
bun run electron:dev
```

This will start:
- Vite dev server at http://localhost:5173
- Electron application with hot reload

### Available Commands

```bash
# Development
bun run dev              # Start Vite dev server only
bun run electron         # Start Electron only
bun run electron:dev     # Full development (Vite + Electron)

# Production
bun run build            # Build Vite
bun run electron:build   # Build desktop application

# Utilities
bun run test:db          # Test database connection
bun run clean            # Clean build artifacts
bun run rebuild:natives  # Rebuild native modules (better-sqlite3, sharp, etc.)
bun run verify:natives   # Verify native modules
```

---

## Usage Guide

### 1. Initial Setup

When you first launch Dome:

1. **Complete the onboarding** — a guided tour walks you through the main features
2. **Configure AI** (optional but recommended):
   - Go to **Settings** (gear icon) → **AI Configuration**
   - Select your AI provider (OpenAI, Anthropic, Google, Ollama)
   - For **Ollama** (local, no API key): [installation guide](docs/guia-instalacion-ollama.md)
   - For cloud providers: Enter your API key and choose your chat model
3. **Configure Indexing** (optional): Go to **Settings → Indexing** to set the provider and model for PageIndex
4. **Configure MCP** (optional): Add MCP servers in Settings → MCP for extended AI tools
5. **Connect Cloud Storage** (optional): Go to **Settings → Cloud Storage** to link Google Drive — see the [Cloud Storage Setup Guide](docs/cloud-storage-setup.md) for credential setup

### 2. Creating Projects

Projects are the main organizational unit:

1. Click **Projects** in the sidebar
2. Click **+ New Project**
3. Enter a name and description
4. Use folders within projects for additional organization

### 3. Adding Resources

Add different types of content to your projects:

**Notes:**
- Click **+ New Resource** → **Note**
- Use the Notion-style editor to write
- Insert blocks with `/` commands

**PDFs:**
- Drag and drop PDF files
- Or click **+ New Resource** → **Import PDF**
- View with annotations in the PDF viewer

**PowerPoints:**
- Drag and drop `.pptx` files
- Navigate slides with arrow keys or the slide strip
- Use **Presentation mode** (button in the header) for full-screen viewing

**URLs:**
- Click **+ New Resource** → **URL**
- Enter the web address
- Content will be automatically scraped

**Media (Videos/Audio/Images):**
- Drag and drop files or use **+ New Resource** → select type
- YouTube URLs are automatically detected

### 4. AI Indexing — "Listo para IA"

Every resource is indexed for AI search in the background:

1. When you open a resource, the **header bar** shows the indexing status badge (next to "Paneles")
2. States: **Indexing…** (spinner) → **Listo para IA** (green, ready) → **Error** (retry button)
3. Once indexed, Many can search that resource with full semantic accuracy
4. Re-index from **Settings → Indexing** if content changes

### 5. Using the AI Assistant (Many)

The LangGraph-powered assistant helps with research:

1. Click the **Many** floating button (bottom-right)
2. Chat with context from your current resource — Many knows what you're viewing
3. Enable **My resources** and **Web search** for tool use
4. Use quick prompts: "Summarize my current resource", "Search my resources"
5. Create flashcards: "Generate flashcards from this document"
6. Manage calendar: "Schedule a meeting tomorrow at 3pm"
7. Sessions persist across app restarts

### 6. Studio — Generate Study Materials

From your project content:

1. Go to **Home** → **Studio** (sidebar)
2. Select a project
3. Choose output type: Mindmap, Quiz, Guide, FAQ, Timeline, Table, Flashcards
4. Click **Generate** — AI uses PageIndex and resource tools to ground the output in your actual content
5. View and edit outputs; flashcards open in study mode

### 7. Many Agents — Custom Assistants

Create specialized AI agents tailored to your workflow:

1. Go to **Home** → click **+ Agente** in the sidebar
2. Follow the onboarding: name → instructions → tools → MCP servers → skills → icon
3. Your agent appears in the sidebar; click to chat with it
4. Each agent has its own sessions; switch between agents anytime
5. **Edit** an agent from the agent settings to update any property
6. **Export** agents as JSON to share with others; **import** from the agents list

### 8. Calendar

Manage your schedule alongside your research:

1. Click **Calendar** in the app header
2. Navigate days with the calendar grid; click a day to create an event
3. Fill in the event modal (title, date, time, all-day toggle)
4. **Sync Google Calendar**: Go to **Settings → Calendar** and connect your account
5. Ask Many: "What do I have scheduled this week?" or "Add a meeting on Friday at 2pm"

### 9. Flashcards

Study with spaced repetition:

1. **Home** → **Flashcards**
2. Create a deck manually or ask Many: "Create flashcards from my notes about X"
3. Use swipe (← known / → unknown) or buttons during study
4. Track progress and due cards per deck

### 10. Annotating PDFs

The PDF viewer provides comprehensive annotation:

1. Open a PDF resource
2. Use the toolbar to select annotation type
3. Click and drag on text to annotate
4. Add comments by clicking the comment icon
5. View all annotations in the side panel

### 11. Semantic Search

Find resources by meaning:

1. Click the **Search** icon or press `Cmd/Ctrl + K`
2. Enter your query in natural language
3. Results are ranked by relevance (PageIndex reasoning)
4. Filter by type, project, or tags

### 12. Managing Sources

For academic work:

1. Go to **Library** in the sidebar
2. Click **+ New Source**
3. Fill in bibliographic information
4. Link sources to resources
5. Generate citations with your preferred style

### 13. Using the Editor

The Notion-style editor supports:

**Keyboard Shortcuts:**
- `Cmd/Ctrl + B` - Bold
- `Cmd/Ctrl + I` - Italic
- `Cmd/Ctrl + U` - Underline
- `Cmd/Ctrl + K` - Insert link
- `Cmd/Ctrl + H` - Search & Replace
- `/` - Open block menu

**Block Commands:**
- `/heading1` - Large heading
- `/heading2` - Medium heading
- `/bullet` - Bullet list
- `/numbered` - Numbered list
- `/todo` - Task list
- `/callout` - Callout block
- `/toggle` - Collapsible section
- `/code` - Code block
- `/columns` - Multi-column layout (2–5 columns)
- `/table` - Table with drag-and-drop rows/columns
- `/divider` - Horizontal line
- `/pdf` - Embed PDF page
- `/file` - Attach file

### 14. WhatsApp Connection

To connect WhatsApp:

1. Go to **Settings** → **WhatsApp**
2. Click **Connect**
3. Scan the QR code with your phone
4. Messages will sync automatically

---

## Project Structure

```
dome/
├── app/                          # React Application (Renderer Process)
│   ├── components/               # React Components
│   │   ├── agent-canvas/        # Visual workflow builder (ReactFlow)
│   │   │   ├── nodes/           # Custom nodes (Agent, TextInput, Document, Output, Image)
│   │   │   ├── CanvasWorkspace.tsx
│   │   │   ├── CanvasToolbar.tsx
│   │   │   ├── CanvasSidebar.tsx
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── ExecutionLog.tsx
│   │   │   └── WorkflowLibraryView.tsx
│   │   ├── agent-team/          # Multi-agent collaboration
│   │   │   ├── AgentTeamView.tsx
│   │   │   ├── AgentTeamChat.tsx
│   │   │   └── AgentTeamOnboarding.tsx
│   │   ├── marketplace/         # Marketplace UI
│   │   │   ├── MarketplaceView.tsx
│   │   │   ├── MarketplaceAgentCard.tsx
│   │   │   └── MarketplaceAgentDetail.tsx
│   │   ├── automations/        # Automation rules UI
│   │   │   └── AutomationTargetPanel.tsx
│   │   ├── calendar/            # Calendar grid and event modal
│   │   ├── chat/                # AI Chat (messages, tool cards)
│   │   ├── CommandCenter/       # Search and command palette
│   │   ├── cloud/               # Google Drive file picker UI
│   │   ├── shell/               # Single-window shell (tabs, AppShell, ContentRouter)
│   │   ├── editor/              # Notion-style editor
│   │   │   ├── blocks/          # Custom block components
│   │   │   └── extensions/      # Tiptap extension wiring
│   │   ├── flashcards/          # Flashcard decks, study view
│   │   ├── home/                # Home screen and sidebar
│   │   │   ├── Home.tsx
│   │   │   └── ProjectsDashboard.tsx
│   │   ├── many/                # Many AI panel (floating, chat, header)
│   │   ├── agents/              # Many Agents: onboarding, editing, management
│   │   ├── onboarding/          # First-run setup
│   │   ├── settings/            # Settings panels (AI, Indexing, Calendar, MCP, Plugins, Marketplace…)
│   │   ├── studio/              # Studio home view (mindmap, quiz, etc.)
│   │   ├── viewers/             # Resource viewers (PDF, Video, PPT…)
│   │   │   └── shared/          # Shared viewer components (IndexStatusBadge)
│   │   └── workspace/           # Workspace layout and header
│   ├── lib/                     # Business Logic
│   │   ├── ai/                  # AI Client, LangChain adapter, Tools
│   │   │   ├── catalogs/        # Model catalogs by provider
│   │   │   ├── providers/       # Provider implementations
│   │   │   └── tools/           # Web, resources, memory, flashcards, calendar, image tools
│   │   │       ├── image-crop.ts
│   │   │       ├── image-thumbnail.ts
│   │   │       └── pdf-extraction-tools.ts
│   │   ├── automations/        # Automation logic
│   │   ├── db/                  # Database clients (SQLite, PageIndex)
│   │   ├── dome-editor/         # Dome's own Tiptap extension library (MIT)
│   │   ├── hooks/               # React hooks
│   │   ├── marketplace/        # Marketplace loaders and catalog
│   │   ├── store/               # Zustand (useManyStore, useAgentChatStore, useCalendarStore, useMarketplaceStore…)
│   │   ├── agents/              # Many Agents API and catalog
│   │   ├── studio/              # Studio constants and outputs
│   │   ├── i18n.ts              # Translations (en, es, fr, pt)
│   │   └── utils/               # Utilities
│   ├── pages/                   # Route pages (Calendar, Settings, PPT…)
│   ├── types/                   # TypeScript definitions
│   └── workspace/               # Workspace routes
├── electron/                     # Electron Main Process
│   ├── main.cjs                 # Entry point, IPC handlers
│   ├── preload.cjs              # Preload (IPC bridge)
│   ├── database.cjs             # SQLite operations
│   ├── file-storage.cjs         # File system management
│   ├── ai-cloud-service.cjs     # Cloud AI providers
│   ├── ai-tools-handler.cjs     # AI tools (resources, flashcard create)
│   ├── langgraph-agent.cjs      # LangGraph agent (chat with tools)
│   ├── doc-indexer.cjs          # PageIndex document indexer
│   ├── docling-pipeline.cjs     # Docling conversion orchestration
│   ├── docling-client.cjs       # Docling service client
│   ├── resource-indexer.cjs     # Resource indexing orchestrator
│   ├── calendar-service.cjs      # Calendar CRUD + Google sync
│   ├── calendar-notification-service.cjs  # Desktop event reminders
│   ├── mcp-client.cjs           # MCP server connections
│   ├── ollama-service.cjs       # Ollama integration
│   ├── ppt-slide-extractor.cjs  # Electron-native PPT slide capture
│   ├── youtube-service.cjs      # YouTube utilities
│   ├── web-scraper.cjs         # Playwright scraper
│   ├── thumbnail.cjs             # Image thumbnail generation
│   ├── crop-image.cjs           # Image crop tool
│   ├── pdf-extractor.cjs        # PDF text extraction
│   ├── automation-service.cjs    # Automation rules execution
│   ├── run-engine.cjs           # Background agent workflow execution
│   ├── github-client.cjs        # GitHub integration
│   ├── plugin-loader.cjs        # Plugin system
│   ├── marketplace-config.cjs    # Marketplace configuration
│   ├── ipc/                     # IPC handlers by domain
│   │   ├── index.cjs           # IPC handler registration
│   │   ├── ai.cjs
│   │   ├── agents.cjs
│   │   ├── marketplace.cjs
│   │   ├── docling.cjs
│   │   └── ...
│   ├── window-manager.cjs       # Window management
│   ├── security.cjs             # Security utilities
│   ├── vendor/pageindex/        # PageIndex Python runtime
│   └── whatsapp/                # WhatsApp integration
├── prompts/                      # System prompts (Many, tools)
├── public/                       # Static assets (skills.json, workflows.json, agents.json, plugins.json)
├── assets/                       # Application assets
├── scripts/                      # Build and utility scripts
├── package.json                  # Dependencies and scripts
├── vite.config.ts                # Vite configuration
├── tailwind.config.cjs           # Tailwind configuration
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

---

## Configuration

### AI Providers

Configure AI in **Settings** → **AI Configuration**:

**OpenAI:**
```
Provider: openai
API Key: sk-...
Model: gpt-4o (or gpt-4, gpt-3.5-turbo)
```

**Anthropic:**
```
Provider: anthropic
API Key: sk-ant-...
Model: claude-sonnet-4-6 (or claude-opus-4-6)
```

**Google:**
```
Provider: google
API Key: AIza...
Model: gemini-1.5-pro (or gemini-1.5-flash)
```

**Ollama (Local):**
```
Provider: ollama
Base URL: http://localhost:11434
Model: llama3.2 (or mistral, qwen, etc.)
```
> Para OCR en PDFs escaneados, usa un modelo con soporte de visión: `llava`, `moondream2`, `minicpm-v`, `glm4v`.

📖 **[Guía completa de instalación con Ollama](docs/guia-instalacion-ollama.md)** – Instalación paso a paso, configuración recomendada y solución de problemas.

### PageIndex (AI Indexing)

Configure in **Settings** → **Indexing**:

- **Provider** — Select which AI provider processes documents (defaults to your main AI provider)
- **Model** — Choose the model used for document parsing and indexing
- **Re-index all** — Trigger a full re-index of all project resources
- Indexing runs automatically in the background when resources are added or updated

### Cloud Storage — Google Drive

Connect Google Drive in **Settings** → **Cloud Storage**.

Dome uses **PKCE OAuth 2.0** — your tokens are stored locally in the SQLite database and never sent to Dome servers.

**Required environment variables** (set in `.env.local` for development, or as GitHub secrets for CI builds):

```bash
DOME_GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
DOME_GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-your-client-secret
```

📖 **[Cloud Storage Setup Guide](docs/cloud-storage-setup.md)** — Google Cloud project, OAuth consent, redirect URI `dome://oauth/callback`, and scopes. *(The doc may still mention legacy providers; the app currently ships Google Drive only.)*

### MCP Servers

Configure in **Settings** → **MCP**:

**stdio** (local process):
```json
{
  "name": "my-tools",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
  "env": { "API_KEY": "optional" }
}
```

**http** (remote):
```json
{
  "name": "remote-mcp",
  "type": "http",
  "url": "https://your-mcp-server.com/mcp"
}
```

### Data Storage Locations

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/dome/` |
| Windows | `%APPDATA%/dome/` |
| Linux | `~/.config/dome/` |

**Directory Structure:**
```
dome/
├── dome.db              # SQLite database (resources, agents, calendar, index)
├── dome-files/          # Stored files (PDFs, images, etc.)
│   ├── pdfs/
│   ├── images/
│   ├── audios/
│   ├── videos/
│   └── avatars/
└── dome-thumbnails/     # Generated thumbnails
```

---

## Contributing

**Contributions are welcome and encouraged!**

Dome is an open-source project, and we believe in the power of community collaboration to make it better. Every contribution, no matter how small, helps improve the project for everyone.

### How to Contribute

1. **Fork the repository** (for development only)
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following the code style guidelines
4. **Test your changes** thoroughly
5. **Commit with descriptive messages**
   ```bash
   git commit -m "feat: add your feature description"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** to the main repository

### Code Style

- Use TypeScript with strict mode
- Follow the existing code patterns
- Use 2 spaces for indentation
- Use `const` by default, `let` when necessary, never `var`
- Document complex functions with JSDoc comments

### Important Notes

- **Main Repository**: This is the official and main repository for Dome
- **Fork Support**: We do not provide official support for forks. Please contribute back to the main repository instead of maintaining separate forks
- **Questions**: For questions about contributing, open an issue in the repository

### Contact

For questions, suggestions, or commercial inquiries:

**Email**: alder.velasquezobando@gmail.com

---

## Releases y CI/CD

Los binarios de escritorio (macOS `.dmg` / `.zip`, Windows `.exe`) se generan con **GitHub Actions** (workflow [`.github/workflows/build.yml`](.github/workflows/build.yml)).

- **Cuándo corre**: solo cuando se **publica** un [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) (`release`, tipo `published`). No se ejecuta en cada push a `main` ni en pull requests.
- **Qué hace**: jobs `build-macos` y `build-windows` (**npm ci**, `rebuild:natives`, `electron:build`), luego el job `attach-artifacts` sube los artefactos al **mismo** release que disparó el workflow.
- **Secrets útiles**: firma macOS opcional (`CSC_*`, `APPLE_*`), PostHog (`VITE_POSTHOG_*`), Google Drive en CI (`DOME_GOOGLE_DRIVE_*`). Sin `CSC_LINK`, la build macOS es sin firma/notarización.

Para publicar: crea una etiqueta de versión, abre **Releases → Draft a new release**, elige la etiqueta, escribe las notas y **Publish release**.

---

## License

Dome is released under a custom open-source license. See the [LICENSE](LICENSE) file for full details.

**Summary:**
- Free for personal and educational use
- Modifications and contributions welcome
- Commercial use requires written permission
- Contact: alder.velasquezobando@gmail.com

---

## Acknowledgments

Dome is built with these amazing open-source projects:

- [Electron](https://www.electronjs.org/) - Cross-platform desktop apps
- [Vite](https://vitejs.dev/) - Build tool and dev server
- [React](https://reactjs.org/) - UI library
- [Bun](https://bun.sh/) - Fast JavaScript runtime
- [LangGraph](https://langchain-ai.github.io/langgraphjs/) - AI agent framework
- [LangChain](https://js.langchain.com/) - LLM orchestration and tools
- [Tiptap](https://tiptap.dev/) - Headless editor framework
- [LanceDB](https://lancedb.com/) - Vector database (used in earlier versions)
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Playwright](https://playwright.dev/) - Browser automation
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF rendering
- [pptx-preview](https://github.com/mesmerize-dev/pptx-preview) - PowerPoint rendering
- [driver.js](https://driverjs.com/) - Guided tours
- [PostHog](https://posthog.com/) - Product analytics
- [Lucide](https://lucide.dev/) - Icon library
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite bindings

---

<p align="center">
  <b>Built with passion for researchers and knowledge workers</b>
</p>
