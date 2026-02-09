'use client';

import HomeSidebar from './HomeSidebar';

interface HomeLayoutProps {
  children: React.ReactNode;
  flashcardDueCount?: number;
}

export default function HomeLayout({ children, flashcardDueCount }: HomeLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-44px)] overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <HomeSidebar flashcardDueCount={flashcardDueCount} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
