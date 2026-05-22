import { createContext, useContext } from 'react';

const EditorialHubContext = createContext(false);

export function EditorialHubProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return <EditorialHubContext.Provider value={active}>{children}</EditorialHubContext.Provider>;
}

/** True when hub workspace is embedded in editorial shell tab (hide duplicate toolbar titles). */
export function useEditorialHub(): boolean {
  return useContext(EditorialHubContext);
}
