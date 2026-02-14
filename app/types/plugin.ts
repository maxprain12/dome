/**
 * Dome Plugin API types
 */

export interface DomePluginManifest {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  minDomeVersion?: string;
  repo?: string;
  type?: 'pet';
  sprites?: Record<string, string | string[]>;
}

export interface DomePluginInfo extends DomePluginManifest {
  dir: string;
  enabled: boolean;
}

export interface DomePluginAPI {
  resources: {
    search: (query: string) => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    list: (projectId?: string) => Promise<unknown[]>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
}
