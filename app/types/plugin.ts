/**
 * Dome Plugin API types
 */

export type PluginPermission =
  | 'notes.read'
  | 'notes.write'
  | 'content.publish'
  | 'resources.read'
  | 'projects.read'
  | 'calendar.read';

export type PluginFieldType = 'text' | 'date' | 'tags' | 'slug' | 'sitePath' | 'select';

export interface PluginFieldDefinition {
  id: string;
  type: PluginFieldType;
  label: string;
  options?: string[];
  required?: boolean;
}

export interface PluginVaultTemplate {
  id: string;
  title: string;
  schemaVersion: number;
  fields: PluginFieldDefinition[];
}

export interface DomePluginManifest {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  minDomeVersion?: string;
  repo?: string;
  apiVersion?: 1;
  type?: 'pet' | 'view';
  entry?: string;
  permissions?: PluginPermission[];
  contributes?: {
    view?: { id: string; title: string };
    vaultTemplate?: PluginVaultTemplate;
  };
  sprites?: Record<string, string | string[]>;
}

export interface DomePluginInfo extends DomePluginManifest {
  dir: string;
  enabled: boolean;
  configured: boolean;
  manifestDigest: string;
}

export interface PluginConfiguration {
  pluginId?: string;
  projectId: string;
  permissions: PluginPermission[];
  github?: {
    repo: string;
    branch: string;
    pathPrefix?: string;
    contentPaths?: Record<string, string>;
  };
}

export interface PluginNoteSchema {
  pluginId: string;
  template: PluginVaultTemplate;
  values: Record<string, string | string[]>;
  updatedAt: number;
}
