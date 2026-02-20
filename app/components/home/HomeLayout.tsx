import HomeSidebar from './HomeSidebar';
import PetPluginSlot from '@/components/plugins/PetPluginSlot';

interface HomeLayoutProps {
  children: React.ReactNode;
  flashcardDueCount?: number;
  /** Folder tree pane (shown between sidebar and main when in library view) */
  folderPane?: React.ReactNode;
  /** Hide pet/mascot (e.g. when in agent chat view) */
  hidePet?: boolean;
}

export default function HomeLayout({ children, flashcardDueCount, folderPane, hidePet }: HomeLayoutProps) {
  return (
    <div
      className="flex min-h-0 overflow-hidden"
      style={{ height: 'calc(100vh - var(--app-header-total))', background: 'var(--dome-bg)' }}
    >
      <HomeSidebar flashcardDueCount={flashcardDueCount} />
      {folderPane}
      <main className="flex-1 min-w-0 overflow-y-auto overscroll-contain relative">
        {children}
        {!hidePet && <PetPluginSlot />}
      </main>
    </div>
  );
}
