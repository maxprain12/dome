/**
 * Pure helpers extracted from importFileToLibrary (S3776).
 * Run: node --test electron/__tests__/import-file-to-library-helpers.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveImportExtension,
  resolveImportEffectiveType,
  writeImportTempFile,
  extractImportedContentText,
  validateImportFileArgs,
  createImportedResourceRecord,
  moveImportedResourceToFolder,
  scheduleImportedResourceIndex,
  unlinkImportTempFile,
} = require('../tools/import-file-to-library-helpers.cjs');

describe('validateImportFileArgs', () => {
  it('requires a non-empty title', () => {
    assert.deepEqual(validateImportFileArgs({ title: '  ', content: 'x' }), {
      success: false,
      error: 'title is required',
    });
    assert.deepEqual(validateImportFileArgs({ content: 'x' }), {
      success: false,
      error: 'title is required',
    });
  });

  it('requires content or content_base64', () => {
    assert.deepEqual(validateImportFileArgs({ title: 'Note' }), {
      success: false,
      error: 'content or content_base64 is required',
    });
  });

  it('accepts valid title + content', () => {
    assert.equal(validateImportFileArgs({ title: 'Note', content: 'hello' }), null);
  });

  it('accepts valid title + content_base64', () => {
    assert.equal(validateImportFileArgs({ title: 'Note', content_base64: 'YQ==' }), null);
  });
});

describe('resolveImportExtension', () => {
  it('prefers filename extension', () => {
    assert.equal(resolveImportExtension('Report.PDF', 'text/plain', path), '.pdf');
  });

  it('maps mime to pdf / docx / txt when no filename', () => {
    assert.equal(resolveImportExtension(undefined, 'application/pdf', path), '.pdf');
    assert.equal(
      resolveImportExtension(undefined, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', path),
      '.docx',
    );
    assert.equal(resolveImportExtension(undefined, 'application/docx', path), '.docx');
    assert.equal(resolveImportExtension(undefined, 'text/plain', path), '.txt');
    assert.equal(resolveImportExtension(undefined, undefined, path), '.txt');
  });
});

describe('resolveImportEffectiveType', () => {
  it('detects pdf from ext or mime', () => {
    assert.equal(resolveImportEffectiveType('.pdf', undefined), 'pdf');
    assert.equal(resolveImportEffectiveType('.txt', 'application/pdf'), 'pdf');
  });

  it('detects document from ext or mime', () => {
    assert.equal(resolveImportEffectiveType('.docx', undefined), 'document');
    assert.equal(resolveImportEffectiveType('.doc', undefined), 'document');
    assert.equal(resolveImportEffectiveType('.bin', 'application/msword'), 'document');
    assert.equal(
      resolveImportEffectiveType('.bin', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      'document',
    );
  });

  it('defaults to note', () => {
    assert.equal(resolveImportEffectiveType('.txt', 'text/plain'), 'note');
  });
});

describe('writeImportTempFile', () => {
  it('writes base64 when provided', () => {
    const calls = [];
    writeImportTempFile(
      { writeFileSync: (...args) => { calls.push(args); } },
      '/tmp/x',
      'ignored',
      Buffer.from('hi').toString('base64'),
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/tmp/x');
    assert.ok(Buffer.isBuffer(calls[0][1]));
    assert.equal(calls[0][1].toString('utf8'), 'hi');
  });

  it('writes utf8 content otherwise (empty string when missing)', () => {
    const calls = [];
    writeImportTempFile(
      { writeFileSync: (...args) => { calls.push(args); } },
      '/tmp/y',
      undefined,
      undefined,
    );
    assert.deepEqual(calls[0], ['/tmp/y', '', 'utf8']);
  });
});

describe('extractImportedContentText', () => {
  it('extracts pdf text', async () => {
    const documentExtractor = {
      extractTextFromPDF: async (p, n) => `pdf:${p}:${n}`,
      extractDocxText: async () => 'docx',
      extractDocumentText: async () => 'note',
    };
    const text = await extractImportedContentText({
      documentExtractor,
      fullPath: '/f.pdf',
      effectiveType: 'pdf',
      ext: '.pdf',
      importMimeType: 'application/pdf',
      content: 'fallback',
      contentBase64: undefined,
    });
    assert.equal(text, 'pdf:/f.pdf:50000');
  });

  it('extracts docx only for document + doc(x) ext', async () => {
    const documentExtractor = {
      extractTextFromPDF: async () => 'pdf',
      extractDocxText: async () => 'docx-ok',
      extractDocumentText: async () => 'note',
    };
    assert.equal(
      await extractImportedContentText({
        documentExtractor,
        fullPath: '/f.docx',
        effectiveType: 'document',
        ext: '.docx',
        importMimeType: 'application/msword',
        content: 'fallback',
        contentBase64: undefined,
      }),
      'docx-ok',
    );
    // document type but wrong ext keeps fallback content
    assert.equal(
      await extractImportedContentText({
        documentExtractor,
        fullPath: '/f.bin',
        effectiveType: 'document',
        ext: '.bin',
        importMimeType: 'application/msword',
        content: 'fallback',
        contentBase64: undefined,
      }),
      'fallback',
    );
  });

  it('extracts note text and prefers content when not base64', async () => {
    const documentExtractor = {
      extractTextFromPDF: async () => 'pdf',
      extractDocxText: async () => 'docx',
      extractDocumentText: async (p, mime) => `note:${p}:${mime}`,
    };
    assert.equal(
      await extractImportedContentText({
        documentExtractor,
        fullPath: '/f.txt',
        effectiveType: 'note',
        ext: '.txt',
        importMimeType: 'text/plain',
        content: 'body',
        contentBase64: undefined,
      }),
      'note:/f.txt:text/plain',
    );
  });

  it('keeps null seed when content_base64 was used and extraction fails', async () => {
    const documentExtractor = {
      extractTextFromPDF: async () => {
        throw new Error('boom');
      },
      extractDocxText: async () => 'docx',
      extractDocumentText: async () => 'note',
    };
    const text = await extractImportedContentText({
      documentExtractor,
      fullPath: '/f.pdf',
      effectiveType: 'pdf',
      ext: '.pdf',
      importMimeType: 'application/pdf',
      content: 'should-not-use',
      contentBase64: 'YQ==',
    });
    assert.equal(text, null);
  });
});

describe('createImportedResourceRecord / move / schedule / unlink', () => {
  it('passes createResourceWithFile args in the original order', () => {
    const args = [];
    const queries = {
      createResourceWithFile: { run: (...a) => { args.push(a); } },
    };
    createImportedResourceRecord(queries, {
      resourceId: 'res_1',
      projectId: 'proj',
      effectiveType: 'note',
      title: '  Hello  ',
      contentText: 'body',
      importResult: {
        internalPath: 'vault/a.txt',
        mimeType: 'text/plain',
        size: 4,
        hash: 'h',
        originalName: 'orig.txt',
      },
      mimeType: 'text/plain',
      filename: 'hello.txt',
      now: 99,
    });
    assert.deepEqual(args[0], [
      'res_1',
      'proj',
      'note',
      'Hello',
      'body',
      null,
      'vault/a.txt',
      'text/plain',
      4,
      'h',
      null,
      'hello.txt',
      null,
      99,
      99,
    ]);
  });

  it('moves only when folder_id and moveResourceToFolder exist', () => {
    const runs = [];
    moveImportedResourceToFolder(
      { moveResourceToFolder: { run: (...a) => { runs.push(a); } } },
      'folder-1',
      'res_1',
      10,
    );
    assert.deepEqual(runs, [['folder-1', 10, 'res_1']]);

    moveImportedResourceToFolder({}, 'folder-1', 'res_1', 10);
    assert.equal(runs.length, 1);
  });

  it('schedules reindex only when shouldIndex is true', () => {
    const calls = { init: 0, schedule: [] };
    scheduleImportedResourceIndex(
      {
        init: () => { calls.init += 1; },
        shouldIndex: () => true,
        scheduleSemanticReindex: (id) => { calls.schedule.push(id); },
      },
      { db: true },
      { id: 'r' },
      'res_9',
    );
    assert.equal(calls.init, 1);
    assert.deepEqual(calls.schedule, ['res_9']);

    scheduleImportedResourceIndex(
      {
        init: () => { calls.init += 1; },
        shouldIndex: () => false,
        scheduleSemanticReindex: (id) => { calls.schedule.push(id); },
      },
      { db: true },
      { id: 'r' },
      'res_skip',
    );
    assert.equal(calls.init, 2);
    assert.deepEqual(calls.schedule, ['res_9']);
  });

  it('unlinkImportTempFile swallows errors', () => {
    unlinkImportTempFile({
      unlinkSync: () => {
        throw new Error('missing');
      },
    }, '/tmp/missing');
  });
});
