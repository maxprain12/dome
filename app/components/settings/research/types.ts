export type Provider = 'brave' | 'tavily' | 'exa';
export interface ResearchPolicy { enabledProviders: Provider[]; perRunUsd: number; monthlyUsd: number }
export interface ResearchRouting { disabledPlatforms: string[]; searchProvider: 'auto' | 'free' | Provider; webSource: 'http' | 'browser' }
export interface ResearchChannel {
  platform: string; group: string; accessStatus: string; readiness: string;
  operations: string[]; wanted: string[]; backends: string[]; upstream: string[]; setup?: string;
  lastCheck: { operation: string; checkedAt: number; outcome: string; evidenceCount: number } | null;
}
export interface ResearchStatus {
  success: boolean; channels: ResearchChannel[]; policy: ResearchPolicy; routing: ResearchRouting;
  providers: Array<{ name: Provider; configured: boolean; enabled: boolean; estimatedUsdPerSearch: number }>;
  usage: { spent: number }; browser: { state: string; selectedTabs: number };
  upstream: { repository: string; commit: string; license: string }; pricingAsOf: string;
}
export interface ProbeResult {
  success: boolean; error?: string; resourceId?: string;
  check?: { operation: string; outcome: string; checkedAt: number; evidenceCount: number };
  evidence?: Array<{ id: string; url: string; title: string; text: string; capturedAt: number }>;
}
