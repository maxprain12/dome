/**
 * loadAgentMemoryContext unit tests.
 * Run: node --test electron/__tests__/agent-memory-context.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);

describe('loadAgentMemoryContext', () => {
  let contextFiles;
  let tempRoot;
  const personalityPath = require.resolve('../personality/personality-loader.cjs');
  const projectMemoryPath = require.resolve('../personality/project-memory.cjs');
  let previousPersonality;
  let previousProjectMemory;
  let previousContext;

  before(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'dome-agents-md-'));
    writeFileSync(join(tempRoot, 'AGENTS.md'), '# Project rules\nBe concise.\n', 'utf8');

    previousPersonality = require.cache[personalityPath];
    previousProjectMemory = require.cache[projectMemoryPath];
    previousContext = require.cache[require.resolve('../personality/context-files.cjs')];

    require.cache[personalityPath] = {
      id: personalityPath,
      filename: personalityPath,
      loaded: true,
      exports: {
        ensureDefaultFiles() {},
        readContextFile(name) {
          if (name === 'SOUL.md') return 'I am Many.';
          if (name === 'USER.md') return 'User prefers Spanish.';
          if (name === 'MEMORY.md') return '### preferred_language\nes';
          return '';
        },
        getRecentMemory() {
          return [{ date: '2026-07-15', content: 'Worked on mentions.' }];
        },
        formatDomainMemoryBlock() {
          return '';
        },
      },
    };

    // Keep real project-memory (pure fs).
    delete require.cache[require.resolve('../personality/context-files.cjs')];
    contextFiles = require('../personality/context-files.cjs');
  });

  after(() => {
    if (previousPersonality) require.cache[personalityPath] = previousPersonality;
    else delete require.cache[personalityPath];
    if (previousProjectMemory) require.cache[projectMemoryPath] = previousProjectMemory;
    if (previousContext) {
      require.cache[require.resolve('../personality/context-files.cjs')] = previousContext;
    } else {
      delete require.cache[require.resolve('../personality/context-files.cjs')];
    }
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('memoryEnabled false keeps soul but clears volatile LTM', () => {
    const ctx = contextFiles.loadAgentMemoryContext({ memoryEnabled: false });
    assert.equal(ctx.soul, 'I am Many.');
    assert.equal(ctx.volatileMemory, '');
    assert.equal(ctx.memoryBlock, '');
    assert.equal(ctx.user, '');
  });

  it('memoryEnabled true includes USER + MEMORY + recent', () => {
    const ctx = contextFiles.loadAgentMemoryContext({
      memoryEnabled: true,
      includeProject: false,
    });
    assert.match(ctx.volatileMemory, /User prefers Spanish/);
    assert.match(ctx.volatileMemory, /preferred_language/);
    assert.match(ctx.volatileMemory, /Worked on mentions/);
  });

  it('includeProject appends AGENTS.md from projectPath', () => {
    const ctx = contextFiles.loadAgentMemoryContext({
      memoryEnabled: true,
      includeProject: true,
      projectPath: tempRoot,
    });
    assert.match(ctx.projectMemory, /Project memory/);
    assert.match(ctx.volatileMemory, /Be concise/);
  });
});
