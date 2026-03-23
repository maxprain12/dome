import HomeLayout from './HomeLayout';
import DashboardView from './DashboardView';
import ProjectsDashboard from './ProjectsDashboard';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';

export default function Home() {
  const currentProject = useAppStore((s) => s.currentProject);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const activeSection = useAppStore((s) => s.homeSidebarSection);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const { activateTab, tabs } = useTabStore();

  const handleOpenProjectLibrary = () => {
    setHomeSidebarSection('library');
    const homeTab = tabs.find((tab) => tab.id === 'home');
    if (homeTab) {
      activateTab('home');
    }
  };

  return (
    <HomeLayout>
      {activeSection === 'projects' ? (
        <ProjectsDashboard
          currentProject={currentProject}
          onSelectProject={setCurrentProject}
          onOpenProjectLibrary={handleOpenProjectLibrary}
        />
      ) : (
        <DashboardView />
      )}
    </HomeLayout>
  );
}
