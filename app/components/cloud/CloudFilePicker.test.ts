import { describe, expect, it } from 'vitest';
import { isImportable, type CloudFile } from './CloudFilePicker';

function file(overrides: Partial<CloudFile>): CloudFile {
  return { id: 'file', name: 'Document', mimeType: 'application/pdf', size: 10, modifiedAt: null, isFolder: false, provider: 'google', accountId: 'account', ...overrides };
}

describe('Cloud import compatibility', () => {
  it('allows supported document types and rejects folders or executable content', () => {
    expect(isImportable(file({}))).toBe(true);
    expect(isImportable(file({ mimeType: 'application/vnd.google-apps.document' }))).toBe(true);
    expect(isImportable(file({ isFolder: true }))).toBe(false);
    expect(isImportable(file({ mimeType: 'application/javascript' }))).toBe(false);
  });
});
