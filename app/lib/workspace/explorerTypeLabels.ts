const TYPE_I18N_KEYS: Record<string, string> = {
  note: 'folder.typeNote',
  notebook: 'folder.typeNotebook',
  url: 'folder.typeUrl',
  pdf: 'folder.typePdf',
  image: 'folder.typeImage',
  video: 'folder.typeVideo',
  audio: 'folder.typeAudio',
  document: 'folder.typeDocument',
  ppt: 'folder.typePpt',
  excel: 'folder.typeExcel',
  csv: 'folder.typeCsv',
  xlsx: 'folder.typeExcel',
  docx: 'folder.typeDocument',
  artifact: 'folder.typeArtifact',
  folder: 'folder.typeFolder',
};

export function resourceTypeI18nKey(type: string, isFolder = false): string {
  if (isFolder) return 'folder.typeFolder';
  return TYPE_I18N_KEYS[type] ?? 'folder.typeFile';
}

const TYPE_BADGES: Record<string, string> = {
  pdf: 'PDF',
  excel: 'XLSX',
  xlsx: 'XLSX',
  csv: 'CSV',
  document: 'DOCX',
  docx: 'DOCX',
  ppt: 'PPTX',
  image: 'IMG',
  video: 'MP4',
  audio: 'AUDIO',
  note: 'NOTE',
  notebook: 'NOTE',
  url: 'URL',
  artifact: 'APP',
};

/** Short Finder-style type tile label (extension when present). */
export function resourceTypeBadge(type: string, name?: string): string {
  const fromName = name?.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  if (fromName) return fromName.toUpperCase();
  return TYPE_BADGES[type] ?? 'FILE';
}
