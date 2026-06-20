/* eslint-disable no-console */
/**
 * Guide bootstrap: creates a rich onboarding guide on first launch.
 * Creates a folder structure in the default project with notes showcasing
 * all editor capabilities and how to use each section of the app.
 *
 * Primary seed guarded by settings `guide_seeded_v2`. Empty guide bodies from
 * older builds are patched once via `guide_body_repaired_v2`.
 */

'use strict';

const { randomUUID } = require('crypto');

// v3: guide regenerated in English. Bumping re-seeds existing installs,
// replacing the older Spanish guide (cleanup matches its titles too).
const SEED_FLAG = 'guide_seeded_v3';
/** Bump when repair heuristics change (forces one more SQLite pass). */
const GUIDE_REPAIR_FLAG = 'guide_body_repaired_v3';
const PROJECT_ID = 'default';
/** Sidebar may truncate emoji; recognize current + legacy (Spanish) titles so
 * re-seeding cleans up the old guide instead of duplicating it. */
const GUIDE_FOLDER_TITLES = ['📚 Dome Guide', 'Dome Guide', '📚 Guía de Dome', 'Guía de Dome'];
/** Sections sub-folder: current + legacy title (for cleanup/repair lookups). */
const SECTIONS_FOLDER_TITLES = ['Sections', 'Apartados'];

/** @returns {Array<{ id: string }>} */
function listGuideRootFolders(db) {
  const placeholders = GUIDE_FOLDER_TITLES.map(() => '?').join(',');
  return db.prepare(`SELECT id FROM resources WHERE type = 'folder' AND title IN (${placeholders})`).all(
    ...GUIDE_FOLDER_TITLES,
  );
}

// ─── Tiny JSON content helpers ───────────────────────────────────────────────

function doc(...nodes) {
  return JSON.stringify({ type: 'doc', content: nodes });
}

function h(level, ...inline) {
  return { type: 'heading', attrs: { level }, content: inline };
}

function p(...inline) {
  return { type: 'paragraph', content: inline.length ? inline : undefined };
}

function text(t, marks) {
  const node = { type: 'text', text: t };
  if (marks && marks.length) node.marks = marks;
  return node;
}

function bold(t) { return text(t, [{ type: 'bold' }]); }
function italic(t) { return text(t, [{ type: 'italic' }]); }
function code(t) { return text(t, [{ type: 'code' }]); }
function link(t, href) { return text(t, [{ type: 'link', attrs: { href } }]); }

function mention(id, label) {
  return {
    type: 'mention',
    attrs: { id, label, resourceType: 'note', mentionSuggestionChar: '@' },
  };
}

function callout(variant, ...content) {
  return { type: 'callout', attrs: { variant }, content };
}

function toggle(summary, ...bodyContent) {
  return {
    type: 'toggleBlock',
    attrs: { collapsed: false },
    content: [
      { type: 'toggleSummary', content: [text(summary)] },
      { type: 'toggleBody', content: bodyContent },
    ],
  };
}

function ul(...items) {
  return {
    type: 'bulletList',
    content: items.map((c) => ({
      type: 'listItem',
      // c is already [paragraph, ...] — use it directly as listItem content
      content: Array.isArray(c) ? c : [p(c)],
    })),
  };
}

function ol(...items) {
  return {
    type: 'orderedList',
    content: items.map((c) => ({
      type: 'listItem',
      // c is already [paragraph, ...] — use it directly as listItem content
      content: Array.isArray(c) ? c : [p(c)],
    })),
  };
}

function tasks(...items) {
  return {
    type: 'taskList',
    content: items.map(([checked, ...inline]) => ({
      type: 'taskItem',
      attrs: { checked },
      content: [p(...inline)],
    })),
  };
}

function quote(...content) {
  return { type: 'blockquote', content };
}

function codeblock(lang, code) {
  return { type: 'codeBlock', attrs: { language: lang }, content: [{ type: 'text', text: code }] };
}

function hr() {
  return { type: 'horizontalRule' };
}

function sep() {
  return p();
}

// ─── Note content builders ────────────────────────────────────────────────────

function buildMainNote() {
  return doc(
    h(1, text('👋 Welcome to Dome')),
    callout('olive',
      p(
        bold('Dome'),
        text(' is your personal knowledge space — a powerful editor, a built-in AI assistant, and a system of interconnected resources.'),
      ),
    ),
    sep(),
    h(2, text('📚 This guide')),
    p(text('Explore the '), bold('Sections'), text(' folder in the sidebar to discover everything you can do:')),
    ul(
      [p(text('✍️  '), bold('The note editor'), text(' — Blocks, slash commands, formatting and more'))],
      [p(text('🤖  '), bold('Many Assistant (AI)'), text(' — Your writing and research copilot'))],
      [p(text('🔗  '), bold('Backlinks & mentions'), text(' — Connect ideas with @mentions'))],
      [p(text('📁  '), bold('Resource management'), text(' — PDFs, images, URLs and notes'))],
      [p(text('⚡  '), bold('Agents & automations'), text(' — AI-powered workflows'))],
      [p(text('🔍  '), bold('Semantic search'), text(' — Find anything instantly'))],
    ),
    sep(),
    h(2, text('💡 How to use @mentions')),
    p(text('While in any note, type '), code('@'), text(' followed by a note name to create a bidirectional link. For example, type '), code('@The note editor'), text(' to link to the editor note.')),
    sep(),
    h(2, text('🚀 Getting started')),
    tasks(
      [false, text('Open the '), bold('Many'), text(' panel (✦ button in the top bar) and ask it a question')],
      [false, text('Type '), code('/'), text(' in any note to open the block menu')],
      [false, text('Type '), code('@'), text(' to mention a note or resource')],
      [false, text('Select text and use the bubble menu to apply AI formatting')],
      [false, text('Drag a PDF into the sidebar to import it and chat with it')],
    ),
    sep(),
    h(2, text('⌨️ Essential shortcuts')),
    ul(
      [p(code('⌘S'), text(' — Save manually (autosaves every 1.5s anyway)'))],
      [p(code('⌘J'), text(' — Insert AI block at the cursor'))],
      [p(code('/'), text(' — Block menu (slash command)'))],
      [p(code('@'), text(' — Mention a workspace resource'))],
      [p(code('⌘K'), text(' — Create/edit a link'))],
      [p(code('⌘\\'), text(' — Focus mode'))],
    ),
    sep(),
    callout('info',
      p(text('💡 '), bold('Tip:'), text(' Try '), bold('focus mode'), text(' (👁 icon in the bar) to write distraction-free in serif typography.')),
    ),
  );
}

function buildEditorNote() {
  return doc(
    h(1, text('✍️ The note editor')),
    p(text('Dome uses a modern, TipTap-based block editor. Everything is designed to be fast and powerful.')),
    sep(),
    h(2, text('⚡ Slash commands ( / )')),
    p(text('Type '), code('/'), text(' on any empty line to open the block menu. You can search by typing the block name.')),
    callout('olive',
      p(bold('Available categories:')),
      ul(
        [p(bold('Text'), text(' — Paragraph, H1, H2, H3, Quote'))],
        [p(bold('Lists'), text(' — Bullet, Numbered, To-do (checkboxes)'))],
        [p(bold('Dome blocks'), text(' — Callout, Toggle, Code, Divider, Columns, Table'))],
        [p(bold('AI'), text(' — Ask Many, Continue writing, Summary'))],
        [p(bold('Embeds'), text(' — Image, @ mention, YouTube/iframe'))],
      ),
    ),
    sep(),
    h(2, text('📦 Special blocks')),
    toggle('Callout — highlighted notes',
      p(text('Callouts highlight important information. There are 5 variants: '), bold('info'), text(', '), bold('warning'), text(', '), bold('error'), text(', '), bold('success'), text(', '), bold('olive'), text(' (Dome accent).')),
      callout('info', p(text('ℹ️ This is an '), bold('info'), text(' callout.'))),
      callout('warning', p(text('⚠️ This is a '), bold('warning'), text(' callout.'))),
      callout('olive', p(text('✦ This is an '), bold('olive'), text(' callout — great for AI tips.'))),
    ),
    toggle('Toggle — collapsible blocks',
      p(text('Toggles let you hide content until the reader expands it. Click the triangle to collapse/expand.')),
      toggle('Nested toggle example',
        p(text('Toggles can be nested inside other toggles for complex hierarchies.')),
      ),
    ),
    toggle('Code blocks',
      codeblock('javascript', `// Code example with syntax highlighting
function greet(name) {
  return \`Hello, \${name}! Welcome to Dome.\`;
}

console.log(greet('World'));`),
      p(text('Code blocks support syntax highlighting for '), bold('JavaScript'), text(', Python, TypeScript, Bash, SQL, and more.')),
    ),
    toggle('AI blocks (Many)',
      p(text('AI blocks let you ask Many '), bold('right inside the document'), text('. The result is inserted as editor content.')),
      p(text('Insert one with '), code('/'), text(' → '), bold('Ask Many'), text(' or with '), code('⌘J'), text('.')),
    ),
    sep(),
    h(2, text('✨ Text formatting')),
    p(
      text('Select text to reveal the '),
      bold('bubble menu'),
      text('. You get: '),
      bold('Bold'),
      text(', '),
      italic('Italic'),
      text(', '),
      text('Underline', [{ type: 'underline' }]),
      text(', '),
      text('Strikethrough', [{ type: 'strike' }]),
      text(', '),
      code('Inline code'),
      text(' and Link ('),
      code('⌘K'),
      text(').'),
    ),
    sep(),
    h(2, text('🗂️ Tables and columns')),
    p(text('Create tables with '), code('/table'), text(' and columns with '), code('/columns'), text('. They support drag & drop of rows/columns and resizing.')),
    sep(),
    h(2, text('💾 Autosave')),
    callout('info',
      p(text('Dome saves automatically '), bold('1.5 seconds'), text(' after the last change and on blur. You can also use '), code('⌘S'), text(' to save manually.')),
      p(text('The status indicator in the top bar shows: '), bold('Saved'), text(' · '), bold('Unsaved'), text(' · '), bold('Saving…'), text(' · '), bold('Error')),
    ),
  );
}

function buildManyNote() {
  return doc(
    h(1, text('🤖 Many Assistant (AI)')),
    p(text('Many is the AI assistant built into Dome. It is everywhere: side panel, editor, bubble bar and search.')),
    sep(),
    h(2, text('📍 Where Many lives')),
    ul(
      [p(bold('✦ Many button'), text(' in the action bar of any note — opens the chat side panel'))],
      [p(bold('Bubble menu'), text(' — select text and use the '), bold('Many ▾'), text(' pill for AI actions on the selection'))],
      [p(bold('AI block'), text(' — '), code('/ask many'), text(' to insert a prompt directly in the document'))],
      [p(bold('Search'), text(' — Many can answer questions about your resources'))],
    ),
    sep(),
    h(2, text('💬 How to chat with Many')),
    ol(
      [p(text('Open the Many panel with the '), bold('✦ Many'), text(' button or '), code('⌘J'))],
      [p(text('Type your question or instruction in the text field'))],
      [p(text('Many automatically has access to the '), bold('open note context'), text(' and your sources'))],
      [p(text('You can attach files, mention resources with '), code('@'), text(', or paste images'))],
    ),
    sep(),
    h(2, text('🎯 AI actions on a selection')),
    p(text('Select any text in the editor and use the '), bold('Many ▾'), text(' pill to:')),
    ul(
      [p(bold('Improve writing'), text(' — improve clarity and flow'))],
      [p(bold('Make shorter'), text(' — condense the text while keeping its meaning'))],
      [p(bold('Expand'), text(' — add more detail and depth'))],
      [p(bold('Summarize'), text(' — generate an executive summary'))],
      [p(bold('Continue'), text(' — Many continues the text from where you left off'))],
      [p(bold('Translate'), text(' — translate to any language'))],
      [p(bold('Turn into tasks'), text(' — extract actionable items into a to-do list'))],
      [p(bold('Explain'), text(' — explain the content in accessible terms'))],
    ),
    sep(),
    h(2, text('📎 Context and sources')),
    callout('olive',
      p(text('Many can read your PDFs, notes and resources automatically. Open the '), bold('Sources'), text(' panel (📋 button in the bar) to control which documents it has available.')),
    ),
    sep(),
    h(2, text('🔧 Settings')),
    p(text('Go to '), bold('Settings → AI'), text(' to:')),
    ul(
      [p(text('Choose a provider: '), bold('OpenAI, Anthropic, Google, Ollama (local)'))],
      [p(text('Configure the main model and the embeddings model'))],
      [p(text('Adjust the token budget'))],
    ),
    callout('info',
      p(text('💡 For full privacy, use '), bold('Ollama'), text(' to run local models without sending data to external servers.')),
    ),
  );
}

function buildBacklinksNote() {
  return doc(
    h(1, text('🔗 Backlinks & mentions')),
    p(text('Dome connects your ideas automatically. Every time you mention a note, a bidirectional '), bold('backlink'), text(' is created.')),
    sep(),
    h(2, text('@ Mentions')),
    p(text('Type '), code('@'), text(' in the editor followed by a resource name to create a mention:')),
    codeblock('', '@ + note/PDF/resource name → pick from the pop-up menu'),
    p(text('Mentions show up as interactive chips: '), bold('click'), text(' one to open that resource.')),
    sep(),
    callout('olive',
      p(bold('Example:'), text(' You can see how it works in this very note. The mentions in this guide’s main note are real backlinks to each section.')),
    ),
    sep(),
    h(2, text('🔍 View a note’s backlinks')),
    p(text('The right side panel (📖 button in the bar) shows:')),
    ul(
      [p(bold('Backlinks'), text(' — which notes mention the current note'))],
      [p(bold('Outgoing mentions'), text(' — which resources this note mentions'))],
      [p(bold('AI summary'), text(' — Many can generate a summary of the note'))],
    ),
    sep(),
    h(2, text('📊 Note metadata')),
    p(text('The metadata bar below the title shows:')),
    ul(
      [p(bold('Words'), text(' and estimated reading time'))],
      [p(bold('Last edited'), text(' relative time (X minutes ago)'))],
      [p(bold('Tags'), text(' — click '), code('+'), text(' to add tags'))],
      [p(bold('Backlinks'), text(' — number of notes pointing here'))],
      [p(bold('AI ready'), text(' — indicates whether the note has been indexed for semantic search'))],
    ),
    sep(),
    h(2, text('🏷️ Tags')),
    p(text('Add tags to your notes to organize them by topic. Tags can be used as filters in the sidebar and in search.')),
    tasks(
      [false, text('Try it: type '), code('@'), text(' and look up this note from another one')],
      [false, text('Open the side panel (📖) to see this note’s backlinks')],
      [false, text('Add a tag using the '), code('+'), text(' in the metadata bar')],
    ),
  );
}

function buildRecursosNote() {
  return doc(
    h(1, text('📁 Resource management')),
    p(text('Dome is not just a note editor: it is a complete workspace for your knowledge. You can import and work with many resource types.')),
    sep(),
    h(2, text('📄 Resource types')),
    ul(
      [p(bold('📝 Notes'), text(' — text documents in the block editor'))],
      [p(bold('📄 PDFs'), text(' — drag or import PDFs; Many can read them and answer questions'))],
      [p(bold('🖼️ Images'), text(' — import and reference images in your notes'))],
      [p(bold('🎵 Audio / Video'), text(' — media files with automatic transcription'))],
      [p(bold('🌐 URLs'), text(' — save web pages with content extraction'))],
      [p(bold('📊 Excel/CSV'), text(' — spreadsheets with AI analysis'))],
      [p(bold('📑 PowerPoint'), text(' — present and extract slides as images'))],
    ),
    sep(),
    h(2, text('🗂️ Organizing with folders')),
    p(text('Use the sidebar to organize resources into folders (projects). Drag resources between folders to reorganize them.')),
    callout('info',
      p(text('Folders in Dome are '), bold('projects'), text('. Each project has its own notes, PDFs and resources, though you can mention resources across projects.')),
    ),
    sep(),
    h(2, text('📥 Importing resources')),
    ol(
      [p(bold('Drag & drop'), text(' — drag files straight into the sidebar or the editor'))],
      [p(bold('+ button'), text(' — use the new-resource button in the sidebar'))],
      [p(bold('Clipboard'), text(' — '), code('/image'), text(' pastes an image from the clipboard'))],
      [p(bold('URL'), text(' — paste a URL into the Many chat to import the page'))],
    ),
    sep(),
    h(2, text('🔍 Sources panel')),
    p(text('The '), bold('Sources'), text(' panel (📋 button in the action bar) lets you:')),
    ul(
      [p(text('See all resources related to the current note'))],
      [p(text('Choose which resources Many can use as context'))],
      [p(text('Search within the project’s resources'))],
    ),
    sep(),
    h(2, text('🖥️ Resource viewer')),
    p(text('Open any resource (PDF, video, etc.) by clicking it. The viewer opens in a '), bold('split panel'), text(' next to your note, or in a '), bold('separate tab'), text('.')),
    tasks(
      [false, text('Import a PDF and open the Many chat on that document')],
      [false, text('Drag an image into the editor to insert it as a block')],
      [false, text('Try split mode: ⊞ button in the action bar')],
    ),
  );
}

function buildAgentsNote() {
  return doc(
    h(1, text('⚡ Agents & automations')),
    p(text('Dome includes an AI agent system that can carry out complex tasks autonomously or semi-autonomously.')),
    sep(),
    h(2, text('🤖 What is an agent?')),
    p(text('An agent is a specialized AI assistant with:')),
    ul(
      [p(bold('Custom instructions'), text(' — define its personality, role and capabilities'))],
      [p(bold('Tools'), text(' — access to web search, file management, note creation, etc.'))],
      [p(bold('Skills'), text(' — specialized abilities that extend its capabilities (SKILL.md)'))],
      [p(bold('Memory'), text(' — it can remember context across conversations'))],
    ),
    sep(),
    h(2, text('🏗️ Create an agent')),
    ol(
      [p(text('Go to the '), bold('Agents'), text(' section in the sidebar'))],
      [p(text('Click '), bold('+ New agent'))],
      [p(text('Define a name, description and system instructions'))],
      [p(text('Select the tools it will have available'))],
      [p(text('Start chatting!'))],
    ),
    callout('olive',
      p(text('✦ '), bold('Tip:'), text(' You can use Many directly without creating an agent. Agents are useful when you want a '), bold('specialized'), text(' AI for specific tasks (research, code, data analysis…).')),
    ),
    sep(),
    h(2, text('🔄 Automations')),
    p(text('Automations run workflows on a schedule or in response to events:')),
    ul(
      [p(bold('Triggers'), text(' — scheduled time, new resource, note change…'))],
      [p(bold('Actions'), text(' — run an agent, create a note, send a summary, update tags…'))],
      [p(bold('Visual flows'), text(' — node editor for complex multi-step flows'))],
    ),
    sep(),
    h(2, text('🎯 Skills')),
    p(text('Skills are '), code('SKILL.md'), text(' files that add specialized capabilities to all agents. They live in '), code('~/.dome/skills/')),
    codeblock('markdown', `# My custom skill

## Description
This skill makes agents experts in financial analysis.

## Instructions
When the user mentions financial data, apply these steps:
1. Identify key metrics (ROI, EBITDA, gross margin...)
2. Compare against industry benchmarks
3. Generate actionable insights`),
    sep(),
    h(2, text('📋 Runs and logs')),
    p(text('Every agent run is recorded in the '), bold('Activity'), text(' section. You can review which tools it used, the step-by-step reasoning and the final result.')),
    tasks(
      [false, text('Create your first custom agent')],
      [false, text('Try a daily-summary automation')],
      [false, text('Explore the Skills available in the Marketplace section')],
    ),
  );
}

function buildSearchNote() {
  return doc(
    h(1, text('🔍 Semantic search')),
    p(text('Dome combines keyword search with semantic (AI) search so you can find anything, even when you don’t remember the exact words.')),
    sep(),
    h(2, text('🧠 How does it work?')),
    callout('info',
      p(text('Dome uses a '), bold('hybrid'), text(' search system:')),
      ul(
        [p(bold('FTS (Full-Text Search)'), text(' — exact keyword search, very fast'))],
        [p(bold('Semantic embeddings'), text(' — understands '), italic('meaning'), text(', not just words'))],
        [p(bold('Knowledge graph'), text(' — takes backlinks and relationships between notes into account'))],
      ),
    ),
    sep(),
    h(2, text('🔎 How to search')),
    ol(
      [p(text('Open search with '), code('⌘F'), text(' or the magnifier icon in the sidebar'))],
      [p(text('Type your query in natural language: '), italic('"machine learning ideas from last week"'))],
      [p(text('Use filters: resource type, project, date, tag'))],
      [p(text('Results show the relevant snippet inside the document'))],
    ),
    sep(),
    h(2, text('⚡ Search vs. asking Many')),
    toggle('When to use search?',
      p(text('Use search when you want to '), bold('find a specific document'), text(' or recall '), bold('where you saved something'), text('. It is instant and shows the relevant snippets.')),
    ),
    toggle('When to ask Many?',
      p(text('Use Many when you want to '), bold('synthesize information'), text(' from several documents, get an '), bold('elaborate answer'), text(', or analyze the content of your resources.')),
    ),
    sep(),
    h(2, text('🗄️ Indexing')),
    p(text('Dome indexes all your resources automatically in the background. The '), bold('AI ready'), text(' indicator in a note’s metadata bar confirms it is ready for semantic search.')),
    callout('olive',
      p(text('💡 Semantic indexing can take a few seconds after creating or editing a resource. Dome uses local embeddings '), bold('(Nomic Embed)'), text(' that work offline with full privacy.')),
    ),
    sep(),
    h(2, text('🏷️ Advanced filters')),
    ul(
      [p(code('type:pdf'), text(' — filter PDFs only'))],
      [p(code('project:research'), text(' — limit to the specified project'))],
      [p(code('tag:important'), text(' — filter by tag'))],
      [p(code('since:7d'), text(' — resources modified in the last 7 days'))],
    ),
    tasks(
      [false, text('Search with natural language: "my meeting notes from last month"')],
      [false, text('Try filtering by file type')],
      [false, text('Check the "AI ready" indicator on a note')],
    ),
  );
}

// ─── Guide body repair (empty JSON from legacy Collaboration hydrate bug) ───

/**
 * @param {unknown} raw
 */
function guideContentLooksEmpty(raw) {
  if (raw == null) return true;
  const s = String(raw).trim();
  if (!s) return true;
  try {
    const j = JSON.parse(s);
    if (!j || j.type !== 'doc' || !Array.isArray(j.content)) return false;
    if (j.content.length === 0) return true;
    if (j.content.length === 1) {
      const b0 = j.content[0];
      if (
        b0 &&
        typeof b0 === 'object' &&
        b0.type === 'paragraph' &&
        (!b0.content || b0.content.length === 0)
      ) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @returns {(() => string) | null}
 */
function resolveGuideBodyBuilder(noteTitle) {
  switch (noteTitle) {
    case 'Welcome to Dome 👋':
      return buildMainNote;
    case '✍️ The note editor':
      return buildEditorNote;
    case '🤖 Many Assistant (AI)':
      return buildManyNote;
    case '🔗 Backlinks & mentions':
      return buildBacklinksNote;
    case '📁 Resource management':
      return buildRecursosNote;
    case '⚡ Agents & automations':
      return buildAgentsNote;
    case '🔍 Semantic search':
      return buildSearchNote;
    default:
      return null;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{ id: string, title: string, content: string | null, type: string }>}
 */
function listGuideNotebookRows(db) {
  /** @type {Array<{ id: string, title: string, content: string | null, type: string }>} */
  const notes = [];
  const roots = listGuideRootFolders(db);
  for (const root of roots) {
    /** @type {string} */
    const folderId = root.id;
    const children = db
      .prepare('SELECT id, title, content, type FROM resources WHERE folder_id = ?')
      .all(folderId);
    for (const row of children) {
      if (row.type === 'note') {
        notes.push(row);
      }
      if (row.type === 'folder' && SECTIONS_FOLDER_TITLES.includes(row.title)) {
        const subs = db.prepare(
          "SELECT id, title, content, type FROM resources WHERE folder_id = ? AND type = 'note'",
        ).all(row.id);
        notes.push(...subs);
      }
    }
  }
  return notes;
}

/**
 * Rehydrate guide chapter bodies once on machines that seeded structure but persisted empty TipTap docs.
 *
 * @param {import('better-sqlite3').Database} db
 */
function repairGuideBodiesIfNeeded(db) {
  try {
    const done = db.prepare('SELECT value FROM settings WHERE key = ?').get(GUIDE_REPAIR_FLAG);
    if (done?.value === '1') return;

    const noteRows = listGuideNotebookRows(db);
    if (noteRows.length === 0) return;

    const now = Date.now();
    /** @type {number} */
    let updatedCount = 0;
    db.transaction(() => {
      const upd = db.prepare('UPDATE resources SET content = ?, updated_at = ? WHERE id = ?');
      for (const row of noteRows) {
        if (!guideContentLooksEmpty(row.content)) continue;
        const build = resolveGuideBodyBuilder(row.title);
        if (!build) continue;
        upd.run(build(), now, row.id);
        updatedCount += 1;
      }
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        GUIDE_REPAIR_FLAG,
        '1',
        now,
      );
    })();

    if (updatedCount > 0) {
      console.log(`[Guide] 🔧 Restored ${updatedCount} guide notes (empty body).`);
    }
  } catch (err) {
    console.warn('[Guide] ⚠️ Guide repair skipped:', err?.message || err);
  }
}

// ─── Main seeder ─────────────────────────────────────────────────────────────

/**
 * @param {import('better-sqlite3').Database} db
 */
function seedGuide(db) {
  try {
    // Guard: only run full INSERT once — then optionally repair truncated bodies from older builds
    const flagRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(SEED_FLAG);
    if (flagRow?.value === '1') {
      repairGuideBodiesIfNeeded(db);
      return;
    }

    const now = Date.now();

    // Remove old guide mirror files from disk BEFORE deleting their rows, so the
    // vault watcher's scan does not later re-import them as orphan notes.
    try {
      const vaultStore = require('../storage/vault-store.cjs');
      const fileStorage = require('../storage/file-storage.cjs');
      const databaseMod = require('./database.cjs');
      const collectFileIds = (folderId, acc) => {
        for (const child of db.prepare('SELECT id, type FROM resources WHERE folder_id = ?').all(folderId)) {
          if (child.type === 'folder') collectFileIds(child.id, acc);
          else acc.push(child.id);
        }
      };
      const fileIds = [];
      for (const folder of listGuideRootFolders(db)) collectFileIds(folder.id, fileIds);
      for (const id of fileIds) vaultStore.removeMirrorForResource(id, { database: databaseMod, fileStorage });
    } catch (e) {
      console.warn('[Guide] old mirror cleanup skipped:', e?.message || e);
    }

    // Clean up any previous guide attempts (v1 may have left empty notes)
    const deleteOldGuide = db.transaction(() => {
      const oldFolders = listGuideRootFolders(db);
      for (const folder of oldFolders) {
        // Delete resources in sub-folders
        const subFolders = db.prepare(
          'SELECT id FROM resources WHERE folder_id = ? AND type = ?'
        ).all(folder.id, 'folder');
        for (const sub of subFolders) {
          db.prepare('DELETE FROM resources WHERE folder_id = ?').run(sub.id);
        }
        // Delete sub-folders themselves
        db.prepare('DELETE FROM resources WHERE folder_id = ?').run(folder.id);
        // Delete the root guide folder and its direct children
        db.prepare('DELETE FROM resources WHERE id = ? OR folder_id = ?').run(folder.id, folder.id);
      }
    });
    deleteOldGuide();

    // Pre-generate all IDs so we can cross-reference in content
    const ids = {
      guideFolder:     randomUUID(),
      apartadosFolder: randomUUID(),
      main:            randomUUID(),
      editor:          randomUUID(),
      many:            randomUUID(),
      backlinks:       randomUUID(),
      recursos:        randomUUID(),
      agents:          randomUUID(),
      search:          randomUUID(),
    };

    const insertResource = db.prepare(`
      INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction(() => {
      // 1. Guide root folder
      insertResource.run(
        ids.guideFolder, PROJECT_ID, 'folder', '📚 Dome Guide',
        null, null, null, JSON.stringify({ dome_note_icon: '📚', color: '#7b76d0' }), now - 9000, now - 9000,
      );

      // 2. Sections sub-folder
      insertResource.run(
        ids.apartadosFolder, PROJECT_ID, 'folder', 'Sections',
        null, null, ids.guideFolder, JSON.stringify({ color: '#596037' }), now - 8000, now - 8000,
      );

      // 3. Main note (inside guide folder)
      insertResource.run(
        ids.main, PROJECT_ID, 'note', 'Welcome to Dome 👋',
        buildMainNote(), null, ids.guideFolder,
        JSON.stringify({ dome_note_icon: '🏠' }), now - 7000, now - 7000,
      );

      // 4. Sub-notes (inside Sections folder)
      const subNotes = [
        { id: ids.editor,    title: '✍️ The note editor',      content: buildEditorNote(),    offset: 6000 },
        { id: ids.many,      title: '🤖 Many Assistant (AI)',  content: buildManyNote(),      offset: 5000 },
        { id: ids.backlinks, title: '🔗 Backlinks & mentions', content: buildBacklinksNote(), offset: 4000 },
        { id: ids.recursos,  title: '📁 Resource management',  content: buildRecursosNote(),  offset: 3000 },
        { id: ids.agents,    title: '⚡ Agents & automations',  content: buildAgentsNote(),    offset: 2000 },
        { id: ids.search,    title: '🔍 Semantic search',      content: buildSearchNote(),    offset: 1000 },
      ];

      for (const note of subNotes) {
        insertResource.run(
          note.id, PROJECT_ID, 'note', note.title,
          note.content, null, ids.apartadosFolder,
          null, now - note.offset, now - note.offset,
        );
      }
    });

    insertMany();

    // Seed the plain-text cache (content_text) so FTS, card previews and the
    // semantic index show readable text immediately. The Markdown mirror (.md)
    // is written lazily on first open (renderer owns the conversion).
    try {
      const { extractPlainTextFromProseMirror } = require('../services/resource-text.cjs');
      const setContentText = db.prepare('UPDATE resources SET content_text = ? WHERE id = ?');
      const seededBodies = [
        { id: ids.main, content: buildMainNote() },
        { id: ids.editor, content: buildEditorNote() },
        { id: ids.many, content: buildManyNote() },
        { id: ids.backlinks, content: buildBacklinksNote() },
        { id: ids.recursos, content: buildRecursosNote() },
        { id: ids.agents, content: buildAgentsNote() },
        { id: ids.search, content: buildSearchNote() },
      ];
      db.transaction(() => {
        for (const n of seededBodies) {
          try {
            const txt = extractPlainTextFromProseMirror(JSON.parse(n.content));
            if (txt) setContentText.run(txt, n.id);
          } catch { /* skip a single note on parse failure */ }
        }
      })();
    } catch (e) {
      console.warn('[Guide] content_text seed skipped:', e?.message || e);
    }

    // Mark as seeded (+ skip future repair scans — bodies are fresh from builders)
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      SEED_FLAG, '1', now,
    );
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      GUIDE_REPAIR_FLAG, '1', now,
    );

    console.log('[Guide] ✅ Dome Guide created successfully (' + Object.keys(ids).length + ' resources)');
  } catch (err) {
    console.warn('[Guide] ⚠️ Could not create the guide (non-fatal):', err?.message);
  }
}

module.exports = { seedGuide };
