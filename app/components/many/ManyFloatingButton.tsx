import { useLocation } from 'react-router-dom';
import ManyFloatingTrigger from './ManyFloatingTrigger';
import { useManyStore } from '@/lib/store/useManyStore';
import { useAppStore } from '@/lib/store/useAppStore';

const HIDDEN_ROUTES = ['/settings', '/onboarding'];

export default function ManyFloatingButton() {
  const { pathname } = useLocation();
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const isChatView =
    (pathname === '/' || pathname === '/home') &&
    typeof homeSidebarSection === 'string' &&
    (homeSidebarSection.startsWith('agent:') ||
      homeSidebarSection.startsWith('team:') ||
      homeSidebarSection === 'agents' ||
      homeSidebarSection === 'agent-teams');
  const {
    isOpen,
    toggleOpen,
    status,
    unreadCount,
    whatsappConnected,
    whatsappPendingMessages,
  } = useManyStore();

  const shouldHide = HIDDEN_ROUTES.some((route) => pathname?.startsWith(route)) || isChatView;
  if (shouldHide) return null;
  if (isOpen) return null;

  const totalNotifications = unreadCount + whatsappPendingMessages;

  return (
    <ManyFloatingTrigger
      onClick={toggleOpen}
      status={status}
      totalNotifications={totalNotifications}
      whatsappConnected={whatsappConnected}
    />
  );
}
