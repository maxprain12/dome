# Dome

> Intelligent Desktop Application for Knowledge Management and Academic Research

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh/)
[![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Custom%20Open%20Source-blue.svg)](LICENSE)

Dome is a comprehensive desktop application designed for researchers, academics, and knowledge workers who need to manage, organize, and synthesize information from multiple sources efficiently.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Usage Guide](#usage-guide)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Overview

Dome provides a unified workspace for managing your research and knowledge. It combines powerful AI capabilities with an intuitive interface, allowing you to:

- Organize resources (notes, PDFs, videos, audios, images, URLs) in projects
- Leverage AI assistants for analysis, summarization, and semantic search
- Annotate PDFs with highlights, comments, and notes
- Create rich documents with a Notion-style editor
- Manage academic sources and generate citations
- Scrape web content for offline access
- Connect with WhatsApp for mobile integration

---

## Features

### Knowledge Hub

Centralized management for all your resources:

| Resource Type | Description |
|---------------|-------------|
| **Notes** | Rich text documents with the Notion-style editor |
| **PDFs** | Academic papers and documents with annotation support |
| **Videos** | YouTube videos with thumbnail extraction and metadata |
| **Audios** | Audio files with transcription capabilities |
| **Images** | Visual resources with thumbnail generation |
| **URLs** | Web articles with automatic content extraction |
| **Folders** | Hierarchical organization within projects |

### AI Integration

Dome supports multiple AI providers for maximum flexibility:

**Supported Providers:**
- OpenAI (GPT-4, GPT-4o, etc.)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Opus, etc.)
- Google (Gemini models)
- Ollama (Local models - Llama, Mistral, etc.)
- Venice (Privacy-focused AI)
- Synthetic (Custom providers)

**AI Capabilities:**
- **Martin AI Assistant**: Built-in chat assistant for research help
- **Semantic Search**: Find resources by meaning, not just keywords
- **Auto-Transcription**: Convert audio/video to text
- **Document Summarization**: Get quick summaries of long documents
- **AI Tools**: Web search, web fetch, memory management, context awareness

### PDF Viewer with Annotations

Full-featured PDF viewer with comprehensive annotation tools:

- **Highlight**: Mark important text with custom colors
- **Underline**: Emphasize key passages
- **Strikethrough**: Mark text for revision
- **Comments**: Add notes to specific sections
- **Page Navigation**: Quick jump to any page
- **Zoom Controls**: Fit to width, fit to page, custom zoom

### Notion-Style Editor

Powerful rich text editor built with Tiptap (ProseMirror):

**Block Types:**
- Headings (H1-H6)
- Paragraphs with rich formatting
- Bullet and numbered lists
- Task lists with checkboxes
- Callout blocks with icons
- Toggle blocks (collapsible content)
- Code blocks with syntax highlighting
- Tables with row/column controls
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
- Typography improvements (smart quotes, etc.)

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
- Articles
- Books
- Websites
- Videos
- Podcasts

**Citation Features:**
- Multiple citation styles (APA, MLA, Chicago, Harvard, Vancouver, IEEE)
- Automatic bibliography generation
- DOI and ISBN support
- Author and publication tracking

### Settings & Customization

- **AI Settings**: Configure providers, API keys, and models
- **Appearance**: Light, dark, and system theme modes
- **General**: Auto-save, backup preferences
- **WhatsApp**: Connection management

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh/) |
| Desktop Framework | [Electron 32](https://www.electronjs.org/) |
| Frontend Framework | [Next.js 14](https://nextjs.org/) + [React 18](https://reactjs.org/) |
| UI Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Rich Text Editor | [Tiptap](https://tiptap.dev/) (ProseMirror) |
| Relational Database | SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) |
| Vector Database | [LanceDB](https://lancedb.com/) |
| State Management | [Zustand](https://github.com/pmndrs/zustand) |
| Language | [TypeScript](https://www.typescriptlang.org/) (strict mode) |
| Web Automation | [Playwright](https://playwright.dev/) |
| PDF Rendering | [PDF.js](https://mozilla.github.io/pdf.js/) |

---

## Installation

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.0
- [Node.js](https://nodejs.org/) >= 18 (required for Electron)
- macOS, Windows, or Linux

### Steps

1. **Clone the repository**

```bash
git clone https://github.com/your-username/dome.git
cd dome-local
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
- Next.js development server at http://localhost:3000
- Electron application with hot reload

### Available Commands

```bash
# Development
bun run dev              # Start Next.js only
bun run electron         # Start Electron only
bun run electron:dev     # Full development (Next.js + Electron)

# Production
bun run build            # Build Next.js
bun run electron:build   # Build desktop application

# Utilities
bun run test:db          # Test database connection
bun run clean            # Clean build artifacts
```

---

## Usage Guide

### 1. Initial Setup

When you first launch Dome:

1. **Complete the onboarding** with your profile information
2. **Configure AI** (optional but recommended):
   - Go to **Settings** (gear icon)
   - Select your AI provider
   - Enter your API key
   - Choose preferred models for chat and embeddings

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

**URLs:**
- Click **+ New Resource** → **URL**
- Enter the web address
- Content will be automatically scraped

**Media (Videos/Audio/Images):**
- Drag and drop files
- Or use **+ New Resource** → select type
- YouTube URLs are automatically detected

### 4. Using the AI Assistant (Martin)

The built-in AI assistant helps with research:

1. Click the **Martin** floating button
2. Ask questions about your resources
3. Request summaries, analysis, or explanations
4. Use context from your current resource

### 5. Annotating PDFs

The PDF viewer provides comprehensive annotation:

1. Open a PDF resource
2. Use the toolbar to select annotation type
3. Click and drag on text to annotate
4. Add comments by clicking the comment icon
5. View all annotations in the side panel

### 6. Semantic Search

Find resources by meaning:

1. Click the **Search** icon or press `Cmd/Ctrl + K`
2. Enter your query in natural language
3. Results are ranked by semantic similarity
4. Filter by type, project, or tags

### 7. Managing Sources

For academic work:

1. Go to **Library** in the sidebar
2. Click **+ New Source**
3. Fill in bibliographic information
4. Link sources to resources
5. Generate citations with your preferred style

### 8. Using the Editor

The Notion-style editor supports:

**Keyboard Shortcuts:**
- `Cmd/Ctrl + B` - Bold
- `Cmd/Ctrl + I` - Italic
- `Cmd/Ctrl + U` - Underline
- `Cmd/Ctrl + K` - Insert link
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
- `/divider` - Horizontal line
- `/pdf` - Embed PDF
- `/file` - Attach file

### 9. WhatsApp Connection

To connect WhatsApp:

1. Go to **Settings** → **WhatsApp**
2. Click **Connect**
3. Scan the QR code with your phone
4. Messages will sync automatically

---

## Project Structure

```
dome/
├── app/                          # Next.js Application (Renderer Process)
│   ├── components/               # React Components
│   │   ├── chat/                 # AI Chat components
│   │   ├── CommandCenter/        # Search and command palette
│   │   ├── common/               # Shared components (Martin avatar, etc.)
│   │   ├── editor/               # Notion-style editor
│   │   │   ├── blocks/           # Custom block components
│   │   │   └── extensions/       # Tiptap extensions
│   │   ├── onboarding/           # First-run setup
│   │   ├── settings/             # Settings panels
│   │   ├── user/                 # User profile components
│   │   ├── viewers/              # Resource viewers (PDF, Video, etc.)
│   │   │   └── pdf/              # PDF annotation components
│   │   └── workspace/            # Workspace layout components
│   ├── lib/                      # Business Logic
│   │   ├── ai/                   # AI Client and Tools
│   │   │   ├── catalogs/         # Model catalogs by provider
│   │   │   ├── providers/        # Provider implementations
│   │   │   └── tools/            # AI tool definitions
│   │   ├── db/                   # Database clients
│   │   ├── files/                # File management
│   │   ├── hooks/                # React hooks
│   │   ├── pdf/                  # PDF utilities
│   │   ├── settings/             # Settings management
│   │   ├── store/                # Zustand stores
│   │   ├── utils/                # Utility functions
│   │   └── web/                  # Web processing
│   ├── types/                    # TypeScript definitions
│   ├── settings/                 # Settings page
│   └── workspace/                # Workspace routes
├── electron/                     # Electron Main Process
│   ├── main.cjs                  # Main entry point
│   ├── preload.cjs               # Preload script (IPC bridge)
│   ├── database.cjs              # SQLite operations
│   ├── file-storage.cjs          # File system management
│   ├── ai-cloud-service.cjs      # Cloud AI providers
│   ├── ai-tools-handler.cjs      # AI tool execution
│   ├── ollama-service.cjs        # Ollama integration
│   ├── youtube-service.cjs       # YouTube utilities
│   ├── web-scraper.cjs           # Playwright scraper
│   ├── thumbnail.cjs             # Image thumbnail generation
│   ├── window-manager.cjs        # Window management
│   ├── security.cjs              # Security utilities
│   └── whatsapp/                 # WhatsApp integration
│       ├── service.cjs           # Main service
│       ├── session.cjs           # Session management
│       └── message-handler.cjs   # Message processing
├── public/                       # Static assets
├── assets/                       # Application assets
├── scripts/                      # Utility scripts
├── package.json                  # Dependencies and scripts
├── next.config.mjs               # Next.js configuration
├── tailwind.config.cjs           # Tailwind configuration
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

---

## Configuration

### AI Providers

Configure AI in **Settings** → **AI**:

**OpenAI:**
```
Provider: openai
API Key: sk-...
Model: gpt-4o (or gpt-4, gpt-3.5-turbo)
Embedding Model: text-embedding-3-small
```

**Anthropic:**
```
Provider: anthropic
API Key: sk-ant-...
Model: claude-3-5-sonnet-latest (or claude-3-opus)
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
Model: llama3.2 (or mistral, codellama, etc.)
Embedding Model: nomic-embed-text
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
├── dome.db          # SQLite database
├── dome-vector/         # LanceDB vector database
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
- [Next.js](https://nextjs.org/) - React framework
- [Bun](https://bun.sh/) - Fast JavaScript runtime
- [Tiptap](https://tiptap.dev/) - Headless editor framework
- [LanceDB](https://lancedb.com/) - Vector database
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Playwright](https://playwright.dev/) - Browser automation
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF rendering
- [Lucide](https://lucide.dev/) - Icon library
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite bindings

---

<p align="center">
  <b>Built with passion for researchers and knowledge workers</b>
</p>
