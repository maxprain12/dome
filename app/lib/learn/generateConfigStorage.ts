import { DEFAULT_GENERATE_CONFIG, type GenerateConfig } from '@/lib/learn/types';

const STORAGE_KEY = 'dome:learn-generate-config:v1';

export function loadSavedGenerateConfig(): GenerateConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GENERATE_CONFIG };
    const parsed = JSON.parse(raw) as Partial<GenerateConfig>;
    return { ...DEFAULT_GENERATE_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_GENERATE_CONFIG };
  }
}

export function persistGenerateConfig(config: GenerateConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* quota / private mode */
  }
}
