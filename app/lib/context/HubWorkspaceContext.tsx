'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type HubAutomationsFormMode = 'hidden' | 'new' | 'edit';

export interface HubWorkspaceContextValue {
  openWorkflowCanvas: (workflowId: string) => void;
  openNewWorkflowCanvas: () => void;
  closeWorkflowCanvas: () => void;
  reportAutomationsFormMode: (mode: HubAutomationsFormMode) => void;
  reportRunsDetailActive: (active: boolean) => void;
}

const HubWorkspaceContext = createContext<HubWorkspaceContextValue | null>(null);

export function HubWorkspaceProvider({
  value,
  children,
}: {
  value: HubWorkspaceContextValue;
  children: ReactNode;
}) {
  return <HubWorkspaceContext.Provider value={value}>{children}</HubWorkspaceContext.Provider>;
}

export function useHubWorkspace(): HubWorkspaceContextValue | null {
  return useContext(HubWorkspaceContext);
}
