
import HomeSidebar from './HomeSidebar';

interface HomeLayoutProps {
  children: React.ReactNode;
  flashcardDueCount?: number;
}

export default function HomeLayout({ children, flashcardDueCount }: HomeLayoutProps) {
  return (
    <div
      className="flex min-h-0 overflow-hidden"
      style={{ height: 'calc(100vh - var(--app-header-total))', background: 'var(--dome-bg)' }}
    >
      <HomeSidebar flashcardDueCount={flashcardDueCount} />
      <main className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
        {children}
      </main>
    </div>
  );
}
