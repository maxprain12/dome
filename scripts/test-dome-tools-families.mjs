#!/usr/bin/env node
/* eslint-disable */
/**
 * Tests for the Phase-3 family definition modules in @dome/tools.
 *
 * For EVERY migrated family, asserts:
 *   - each returned def's name is in the 103-tool catalog and `familyOf(name)`
 *     equals the family,
 *   - each def's `parameters.type === 'object'`,
 *   - the number of returned defs equals `toolsInFamily('<family>').length`,
 *   - the exported *_TOOL_NAMES list matches the family members exactly.
 *
 * `node:test`; imports compiled `dist/`. Run: `node --test scripts/test-dome-tools-families.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  familyOf,
  toolsInFamily,
  toolDefName,

  WEB_TOOL_NAMES, webToolDefinitions,
  PROJECTS_TOOL_NAMES, projectsToolDefinitions,
  MEMORY_TOOL_NAMES, memoryToolDefinitions,
  CALENDAR_TOOL_NAMES, calendarToolDefinitions,
  EMAIL_TOOL_NAMES, emailToolDefinitions,
  GITHUB_TOOL_NAMES, githubToolDefinitions,
  ARTIFACTS_TOOL_NAMES, artifactsToolDefinitions,
  FEEDERS_TOOL_NAMES, feedersToolDefinitions,
  FLASHCARDS_TOOL_NAMES, flashcardsToolDefinitions,
  NOTEBOOK_TOOL_NAMES, notebookToolDefinitions,
  OFFICE_TOOL_NAMES, officeToolDefinitions,
  VISION_TOOL_NAMES, visionToolDefinitions,
  DOCS_TOOL_NAMES, docsToolDefinitions,
  ENTITIES_TOOL_NAMES, entitiesToolDefinitions,
  MARKETPLACE_TOOL_NAMES, marketplaceToolDefinitions,
  BROWSER_TOOL_NAMES, browserToolDefinitions,
  IMAGE_TOOL_NAMES, imageToolDefinitions,
  FILE_TOOL_NAMES, fileToolDefinitions,
  SHELL_TOOL_NAMES, shellToolDefinitions,
  STUDIO_TOOL_NAMES, studioToolDefinitions,
  UI_TOOL_NAMES, uiToolDefinitions,
} from '../packages/tools/dist/index.js';

/** @type {Array<[string, readonly string[], () => any[]]>} */
const FAMILIES = [
  ['web', WEB_TOOL_NAMES, webToolDefinitions],
  ['projects', PROJECTS_TOOL_NAMES, projectsToolDefinitions],
  ['memory', MEMORY_TOOL_NAMES, memoryToolDefinitions],
  ['calendar', CALENDAR_TOOL_NAMES, calendarToolDefinitions],
  ['email', EMAIL_TOOL_NAMES, emailToolDefinitions],
  ['github', GITHUB_TOOL_NAMES, githubToolDefinitions],
  ['artifacts', ARTIFACTS_TOOL_NAMES, artifactsToolDefinitions],
  ['feeders', FEEDERS_TOOL_NAMES, feedersToolDefinitions],
  ['flashcards', FLASHCARDS_TOOL_NAMES, flashcardsToolDefinitions],
  ['notebook', NOTEBOOK_TOOL_NAMES, notebookToolDefinitions],
  ['office', OFFICE_TOOL_NAMES, officeToolDefinitions],
  ['vision', VISION_TOOL_NAMES, visionToolDefinitions],
  ['docs', DOCS_TOOL_NAMES, docsToolDefinitions],
  ['entities', ENTITIES_TOOL_NAMES, entitiesToolDefinitions],
  ['marketplace', MARKETPLACE_TOOL_NAMES, marketplaceToolDefinitions],
  ['browser', BROWSER_TOOL_NAMES, browserToolDefinitions],
  ['image', IMAGE_TOOL_NAMES, imageToolDefinitions],
  ['file', FILE_TOOL_NAMES, fileToolDefinitions],
  ['shell', SHELL_TOOL_NAMES, shellToolDefinitions],
  ['studio', STUDIO_TOOL_NAMES, studioToolDefinitions],
  ['ui', UI_TOOL_NAMES, uiToolDefinitions],
];

for (const [family, names, defsFactory] of FAMILIES) {
  test(`${family}: defs are in-catalog, object-typed, and complete`, () => {
    const defs = defsFactory();
    const members = toolsInFamily(family);

    // Count of returned defs matches the catalog family size.
    assert.equal(
      defs.length,
      members.length,
      `${family}: ${defs.length} defs vs ${members.length} catalog members`,
    );

    // Exported *_TOOL_NAMES matches the catalog family members exactly (as a set).
    assert.deepEqual(
      [...names].sort(),
      [...members].sort(),
      `${family}: *_TOOL_NAMES must match toolsInFamily('${family}')`,
    );

    const seen = new Set();
    for (const d of defs) {
      const name = toolDefName(d);
      assert.ok(name, `${family}: every def must have a name`);
      assert.ok(!seen.has(name), `${family}: duplicate def name ${name}`);
      seen.add(name);

      assert.equal(
        familyOf(name),
        family,
        `${name} should resolve to family '${family}' (got '${familyOf(name)}')`,
      );
      assert.ok(names.includes(name), `${name} should be listed in ${family} *_TOOL_NAMES`);
      assert.equal(
        d.function.parameters.type,
        'object',
        `${name}: parameters.type must be 'object'`,
      );
    }
  });
}
