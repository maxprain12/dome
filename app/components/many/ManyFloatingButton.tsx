import { useLocation } from 'react-router-dom';
import ManyFloatingTrigger from './ManyFloatingTrigger';
import { useManyStore } from '@/lib/store/useManyStore';

const HIDDEN_ROUTES = ['/settings', '/onboarding'];

export default function ManyFloatingButton() {
  const { pathname } = useLocation();
  const {
    isOpen,
    toggleOpen,
    status,
    unreadCount,
    whatsappConnected,
    whatsappPendingMessages,
  } = useManyStore();

  const shouldHide = HIDDEN_ROUTES.some((route) => pathname?.startsWith(route));
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
