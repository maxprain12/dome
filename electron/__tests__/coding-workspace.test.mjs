/**
 * Coding workspace store + session resolution + tool path scoping.
 * Run: node --experimental-sqlite --test electron/__tests__/coding-workspace.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

describe('coding workspaces', () => {
  let workspaceStore;
  let workspaceSession;
  let memDb;
  let originalGetDB;
  let repoRoot;
  let nestedDir;

  before(() => {
    repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dome-ws-')));
    nestedDir = path.join(repoRoot, 'src', 'deep');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), '# Rules\nBe terse.\n', 'utf8');
    fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '# Claude rules\nUse pnpm.\n', 'utf8');

    memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE coding_workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        label TEXT,
        trusted INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const database = require('../core/database.cjs');
    originalGetDB = database.getDB;
    database.getDB = () => memDb;
    delete require.cache[require.resolve('../coding/workspace-store.cjs')];
    delete require.cache[require.resolve('../coding/workspace-session.cjs')];
    workspaceStore = require('../coding/workspace-store.cjs');
    workspaceSession = require('../coding/workspace-session.cjs');
  });

  after(() => {
    const database = require('../core/database.cjs');
    database.getDB = originalGetDB;
    memDb.close();
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  describe('normalizeWorkspacePath', () => {
    it('rejects unusable input', () => {
      assert.equal(workspaceStore.normalizeWorkspacePath(''), null);
      assert.equal(workspaceStore.normalizeWorkspacePath(null), null);
      assert.equal(workspaceStore.normalizeWorkspacePath('with\0null'), null);
    });

    it('strips a trailing separator', () => {
      assert.equal(workspaceStore.normalizeWorkspacePath(`${repoRoot}${path.sep}`), repoRoot);
    });

    it('resolves relative segments', () => {
      const noisy = path.join(repoRoot, 'src', '..', 'src', 'deep');
      assert.equal(workspaceStore.normalizeWorkspacePath(noisy), nestedDir);
    });
  });

  describe('trust', () => {
    it('registers untrusted by default', () => {
      const ws = workspaceStore.registerWorkspace(repoRoot, { label: 'demo' });
      assert.equal(ws.trusted, false);
      assert.equal(ws.path, repoRoot);
      assert.equal(workspaceStore.isTrusted(repoRoot), false);
    });

    it('registering again preserves an existing trust decision', () => {
      workspaceStore.setTrust(repoRoot, true);
      const again = workspaceStore.registerWorkspace(repoRoot, { label: 'demo-renamed' });
      assert.equal(again.trusted, true);
      assert.equal(again.label, 'demo-renamed');
    });

    it('trusting a root covers its subdirectories', () => {
      assert.equal(workspaceStore.isTrusted(nestedDir), true);
      assert.equal(workspaceStore.resolveTrustedRoot(nestedDir), repoRoot);
    });

    it('does not leak trust to a sibling with a shared prefix', () => {
      const sibling = `${repoRoot}-other`;
      fs.mkdirSync(sibling, { recursive: true });
      try {
        assert.equal(workspaceStore.isTrusted(sibling), false);
      } finally {
        fs.rmSync(sibling, { recursive: true, force: true });
      }
    });

    it('revoking trust hides the workspace again', () => {
      workspaceStore.setTrust(repoRoot, false);
      assert.equal(workspaceStore.isTrusted(repoRoot), false);
      workspaceStore.setTrust(repoRoot, true);
    });
  });

  describe('assertWorkspaceExists', () => {
    it('throws for a directory that is gone', () => {
      const gone = path.join(repoRoot, 'does-not-exist');
      assert.throws(() => workspaceStore.assertWorkspaceExists(gone), /does not exist/);
    });

    it('throws when the path is a file', () => {
      assert.throws(
        () => workspaceStore.assertWorkspaceExists(path.join(repoRoot, 'AGENTS.md')),
        /does not exist/,
      );
    });
  });

  describe('listContextFiles', () => {
    it('finds AGENTS.md and CLAUDE.md without duplicating case variants', () => {
      const names = workspaceStore.listContextFiles(repoRoot).map((f) => f.name);
      assert.deepEqual(names.sort(), ['AGENTS.md', 'CLAUDE.md']);
    });
  });

  describe('resolveWorkspaceSession', () => {
    it('returns null without a path', () => {
      assert.equal(workspaceSession.resolveWorkspaceSession({}), null);
    });

    it('returns null for a missing directory', () => {
      assert.equal(
        workspaceSession.resolveWorkspaceSession({ workspacePath: path.join(repoRoot, 'nope') }),
        null,
      );
    });

    it('returns null when the workspace is not trusted', () => {
      workspaceStore.setTrust(repoRoot, false);
      assert.equal(workspaceSession.resolveWorkspaceSession({ workspacePath: repoRoot }), null);
      workspaceStore.setTrust(repoRoot, true);
    });

    it('resolves a trusted workspace with its context files', () => {
      const session = workspaceSession.resolveWorkspaceSession({ workspacePath: repoRoot });
      assert.ok(session);
      assert.equal(session.cwd, repoRoot);
      assert.equal(session.trusted, true);
      assert.deepEqual(session.contextFiles.sort(), ['AGENTS.md', 'CLAUDE.md']);
    });

    it('resolves a subdirectory to itself, rooted at the trusted repo', () => {
      const session = workspaceSession.resolveWorkspaceSession({ workspacePath: nestedDir });
      assert.ok(session);
      assert.equal(session.cwd, nestedDir);
      assert.equal(session.root, repoRoot);
    });
  });

  describe('filterToolsForWorkspace', () => {
    const tools = [
      { name: 'file_read' },
      { name: 'file_edit' },
      { name: 'shell_exec' },
      { name: 'git_commit' },
      { name: 'resource_search' },
    ];

    it('hides coding tools without a session', () => {
      const names = workspaceSession.filterToolsForWorkspace(tools, null).map((t) => t.name);
      assert.deepEqual(names, ['file_read', 'resource_search']);
    });

    it('keeps every tool with a session', () => {
      const session = workspaceSession.resolveWorkspaceSession({ workspacePath: repoRoot });
      assert.equal(workspaceSession.filterToolsForWorkspace(tools, session).length, tools.length);
    });
  });
});

describe('scopeToolPaths', () => {
  const { scopeToolPaths } = require('../coding/tool-path-scope.cjs');
  const root = path.join(path.sep, 'repo');

  it('is a no-op outside a coding run', () => {
    const args = { file_path: 'src/a.ts' };
    assert.equal(scopeToolPaths('file_read', args, null).args, args);
  });

  it('is a no-op for tools with no path arguments', () => {
    const args = { query: 'hello' };
    assert.equal(scopeToolPaths('resource_search', args, root).args, args);
  });

  it('resolves a relative path against the workspace root', () => {
    const { args } = scopeToolPaths('file_read', { file_path: 'src/a.ts' }, root);
    assert.equal(args.file_path, path.join(root, 'src', 'a.ts'));
  });

  it('leaves an absolute path in place', () => {
    const abs = path.join(root, 'src', 'b.ts');
    const { args } = scopeToolPaths('file_edit', { file_path: abs }, root);
    assert.equal(args.file_path, abs);
  });

  it('reports a path that escapes the workspace', () => {
    const { args, escaped } = scopeToolPaths('file_read', { file_path: '../secrets.txt' }, root);
    assert.equal(escaped.length, 1);
    assert.equal(escaped[0], args.file_path);
  });

  it('defaults a missing directory to the workspace root', () => {
    assert.equal(scopeToolPaths('file_grep', { pattern: 'TODO' }, root).args.path, root);
    assert.equal(scopeToolPaths('shell_exec', { command: 'pnpm test' }, root).args.cwd, root);
  });

  it('does not invent a path for tools that require an explicit one', () => {
    assert.equal(scopeToolPaths('file_read', {}, root).args.file_path, undefined);
  });
});
