import HomeLayout from '@/components/home/HomeLayout';
import ProjectsDashboard from '@/components/home/ProjectsDashboard';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';

export default function ProjectsPage() {
  const currentProject = useAppStore((s) => s.currentProject);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);

  const handleOpenProjectLibrary = () => {
    setHomeSidebarSection('library');
    useTabStore.getState().activateTab('home');
  };

  return (
    <HomeLayout hidePet>
      <ProjectsDashboard
        currentProject={currentProject}
        onSelectProject={setCurrentProject}
        onOpenProjectLibrary={handleOpenProjectLibrary}
      />
    </HomeLayout>
  );
}
