// Parity test for @dome/prompts.
//
// Proves the package-owned TypeScript assembler (packages/prompts/dist) emits
// BYTE-IDENTICAL output to the legacy esbuild artifact
// (shared/prompt-assembler/index.cjs) for a set of fixed inputs.
//
// Run: node --test scripts/test-dome-prompts.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import * as pkg from '../packages/prompts/dist/index.js';

const require = createRequire(import.meta.url);
const legacy = require('../shared/prompt-assembler/index.cjs');

// Representative core sections object reused across cases.
const CORE_SECTIONS = {
  roleMany: 'You are Many, the Dome assistant.',
  constraintsLanguage: '## Language\nAlways mirror the user language.',
  appContext: '## App\nDome is a knowledge management desktop app.',
  toolGuardrails: '## Guardrails\nNever delete without confirmation.',
  toolSurface: '## Tools\nresource_get, resource_search.',
  toolFormat: '## Format\nReturn JSON tool calls.',
  toolCatalog: '## Catalog\n- resource_get\n- web_fetch',
  filesystemRules: '## FS\nWrite only under the workspace.',
  asyncSubagents: '## Subagents\nDelegate long tasks.',
  outputFormat: '## Output\nUse markdown headers.',
  referenceStub: '## Reference\nCall dome_load_doc for details.',
};

// ---------------------------------------------------------------------------
// buildDomeSystemPrompt — three distinct option sets.
// includeDate:false on the date-bearing cases to avoid Date() flakiness; one
// case exercises the default (date on) path too — both impls call the same
// todayEnLong() within microseconds so the date string is identical.
// ---------------------------------------------------------------------------

const DOME_CASES = [
  {
    name: 'buildDomeSystemPrompt — full, no date, with skills + extras + voice',
    options: {
      staticPersona: 'You are Many.\n\nBe concise.',
      volatileContext: 'Source (session):\n**ui-context**\nLibrary view.',
      skillsCatalogMarkdown: '## Skills\n- pdf-tools: extract text.',
      includeDate: false,
      extraSections: ['Extra A', null, '  ', 'Extra B'],
      voiceLanguage: 'pt',
      omitCoreTools: false,
      coreToolsMode: 'full',
    },
  },
  {
    name: 'buildDomeSystemPrompt — minimal mode, omitCoreTools, no volatile',
    options: {
      staticPersona: 'Agent persona body.',
      volatileContext: null,
      skillsCatalogMarkdown: null,
      includeDate: false,
      extraSections: undefined,
      voiceLanguage: null,
      omitCoreTools: true,
      coreToolsMode: 'minimal',
    },
  },
  {
    name: 'buildDomeSystemPrompt — default (date on), empty persona',
    options: {
      staticPersona: '',
      volatileContext: 'Just a note.',
      skillsCatalogMarkdown: '',
      // includeDate omitted → defaults to true (date line included)
      extraSections: [],
      voiceLanguage: 'en',
    },
  },
];

for (const c of DOME_CASES) {
  test(c.name, () => {
    const got = pkg.buildDomeSystemPrompt(c.options, CORE_SECTIONS);
    const want = legacy.buildDomeSystemPrompt(c.options, CORE_SECTIONS);
    assert.equal(got, want);
  });
}

// ---------------------------------------------------------------------------
// buildSubagentPrompt — fully deterministic.
// ---------------------------------------------------------------------------

const SUBAGENT_CASES = [
  {
    name: 'buildSubagentPrompt — with guardrails section',
    args: [
      '  You are a research subagent.  ',
      '  Summarize the attached PDF.  ',
      { toolGuardrails: '  ## Guardrails\nStay on task.  ', toolSurface: 'ignored' },
    ],
  },
  {
    name: 'buildSubagentPrompt — no sections (default {})',
    args: ['Role body only.', 'Do the thing.'],
  },
];

for (const c of SUBAGENT_CASES) {
  test(c.name, () => {
    const got = pkg.buildSubagentPrompt(...c.args);
    const want = legacy.buildSubagentPrompt(...c.args);
    assert.equal(got, want);
  });
}

// ---------------------------------------------------------------------------
// buildEditorPrompt — fully deterministic (applyTemplate).
// ---------------------------------------------------------------------------

const EDITOR_CASES = [
  {
    name: 'buildEditorPrompt — explicit action instruction',
    arg: {
      systemTemplate:
        'You edit documents.\nContext:\n{{contextSnippet}}\nAction: {{actionInstruction}}\n(repeat: {{contextSnippet}})',
      contextSnippet: 'The doc is about photosynthesis.',
      actionInstruction: 'Rewrite paragraph 2 in simpler terms.',
    },
  },
  {
    name: 'buildEditorPrompt — default action instruction',
    arg: {
      systemTemplate: 'Template {{contextSnippet}} :: {{actionInstruction}}',
      contextSnippet: 'snippet here',
    },
  },
];

for (const c of EDITOR_CASES) {
  test(c.name, () => {
    const got = pkg.buildEditorPrompt(c.arg);
    const want = legacy.buildEditorPrompt(c.arg);
    assert.equal(got, want);
  });
}
