import { createContext, useContext, type ComponentType } from 'react';
import type { CloudMany, Grants } from '@/lib/manys/api';

export interface ManyLibraryScopeProps {
  many: CloudMany;
  busy: boolean;
  onSave: (grants: Grants) => void;
}

/**
 * What the app around the cloud Manys view offers it. Every slot is optional: the view works on its
 * own, and a slot that is missing only hides the control that needs it. The desktop app fills them
 * in (`DesktopManysHost`: open a resource in a tab, pick which library projects a Many may read); a
 * standalone web app can fill in as many as it has.
 */
export interface ManysHostValue {
  /** Opens a resource a Many produced. It rejects with an error code when it cannot. Without it the "open resource" buttons are not shown. */
  openResource?: (id: string) => Promise<void>;
  /** The section where the person chooses which library projects and resources a Many may read. Without it the section is not shown. */
  libraryScope?: ComponentType<ManyLibraryScopeProps>;
  /** Opens a link found in a Many's text. Without it links open in a new browser tab. */
  openLink?: (href: string) => void;
}

const NO_HOST: ManysHostValue = {};

export const ManysHostContext = createContext<ManysHostValue>(NO_HOST);

export const ManysHostProvider = ManysHostContext.Provider;

export function useManysHost(): ManysHostValue {
  return useContext(ManysHostContext);
}
